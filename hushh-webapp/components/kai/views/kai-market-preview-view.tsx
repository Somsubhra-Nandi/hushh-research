"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BriefcaseBusiness,
  ChartColumnIncreasing,
  Cpu,
  LineChart,
  Loader2,
  Newspaper,
  Percent,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
  Zap,
} from "lucide-react";

import { PageHeader, SectionHeader } from "@/components/app-ui/page-sections";
import { NewsTape } from "@/components/kai/home/news-tape";
import { ConnectPortfolioCta } from "@/components/kai/cards/connect-portfolio-cta";
import { MarketOverviewGrid, type MarketOverviewMetric } from "@/components/kai/cards/market-overview-grid";
import { RiaPicksList } from "@/components/kai/cards/renaissance-market-list";
import { SpotlightCard } from "@/components/kai/cards/spotlight-card";
import { ThemeFocusList, type ThemeFocusItem } from "@/components/kai/cards/theme-focus-list";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/lib/morphy-ux/button";
import { Card, CardContent } from "@/lib/morphy-ux/card";
import { CacheService, CACHE_KEYS } from "@/lib/services/cache-service";
import { ensureKaiVaultOwnerToken } from "@/lib/services/kai-token-guard";
import {
  ApiService,
  type KaiHomeInsightsV2,
  type KaiHomePickSource,
} from "@/lib/services/api-service";
import { setKaiActivePickSource } from "@/lib/kai/pick-source-selection";
import { UnlockWarmOrchestrator } from "@/lib/services/unlock-warm-orchestrator";
import { getSessionItem, isNativePlatform, setSessionItem } from "@/lib/utils/session-storage";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/vault/vault-context";

const POLL_INTERVAL_MS = 600_000;
const MIN_REQUEST_GAP_MS = 2_500;
const MARKET_HOME_CACHE_TTL_MS = 600_000;
const SESSION_KAI_HOME_TTL_MS = 600_000;
const LAST_KNOWN_MARKET_HOME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TICKER_CANDIDATE_RE = /^[A-Z][A-Z0-9.-]{0,5}$/;
const EXCLUDED_SYMBOLS = new Set([
  "CASH",
  "MMF",
  "SWEEP",
  "QACDS",
  "BUY",
  "SELL",
  "REINVEST",
  "DIVIDEND",
  "INTEREST",
  "TRANSFER",
  "WITHDRAWAL",
  "DEPOSIT",
]);

function toSymbolsKey(symbols: string[]): string {
  if (!Array.isArray(symbols) || symbols.length === 0) return "default";
  return [...symbols].sort((a, b) => a.localeCompare(b)).join("-");
}

const THEME_ICON_MAP: Array<{ test: RegExp; icon: LucideIcon }> = [
  { test: /ai|chip|semi|data|cloud|infra/i, icon: Cpu },
  { test: /rate|yield|inflation|macro/i, icon: Percent },
  { test: /energy|oil|gas|renewable|power/i, icon: Zap },
];

function toSpotlightDecision(input: string | undefined): "BUY" | "HOLD" | "REDUCE" {
  const text = String(input || "").trim().toUpperCase();
  if (text === "BUY" || text === "STRONG_BUY") return "BUY";
  if (text === "REDUCE" || text === "SELL") return "REDUCE";
  return "HOLD";
}

function isWeakSpotlightDetail(input: string | null | undefined): boolean {
  const text = String(input || "").trim().toLowerCase();
  if (!text) return true;
  return (
    text.includes("no live recommendation feed available") ||
    text.includes("recommendation unavailable") ||
    text.includes("target consensus unavailable")
  );
}

function toSafeHttpUrl(input: string | null | undefined): string | null {
  const text = String(input || "").trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) return null;
  return text;
}

function summarizeSpotlight(row: NonNullable<KaiHomeInsightsV2["spotlights"]>[number]): string {
  const story = String(row.story || "").trim();
  if (story) return story;

  const detail = String(row.recommendation_detail || "").trim();
  if (detail && !isWeakSpotlightDetail(detail)) return detail;

  const headline = String(row.headline || "").trim();
  if (headline) return `Recent coverage: ${headline}`;

  const decision = toSpotlightDecision(row.recommendation);
  const changePct =
    typeof row.change_pct === "number" && Number.isFinite(row.change_pct)
      ? `${row.change_pct >= 0 ? "+" : ""}${row.change_pct.toFixed(2)}% today`
      : null;
  if (decision === "BUY") {
    return changePct
      ? `Momentum is positive (${changePct}) while analyst updates refresh.`
      : "Momentum is positive while analyst updates refresh.";
  }
  if (decision === "REDUCE") {
    return changePct
      ? `Momentum is soft (${changePct}) while analyst updates refresh.`
      : "Momentum is soft while analyst updates refresh.";
  }
  return changePct
    ? `Price action is mixed (${changePct}) while analyst updates refresh.`
    : "Price action is mixed while analyst updates refresh.";
}

function spotlightContextLabel(row: NonNullable<KaiHomeInsightsV2["spotlights"]>[number]): string {
  const source = String(row.headline_source || "").trim();
  if (source) return source;
  const recommendationSource = String(row.recommendation_source || "").trim();
  if (recommendationSource) return recommendationSource;
  return "Market signal feed";
}

function spotlightConfidenceLabel(
  row: NonNullable<KaiHomeInsightsV2["spotlights"]>[number]
): string | null {
  const value = row.confidence;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return `${pct}% confidence`;
}

function formatSpotlightPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Price unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function isUnavailableText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "unknown" ||
    normalized === "unavailable" ||
    normalized === "none" ||
    normalized === "null" ||
    normalized === "--" ||
    normalized === "-"
  );
}

function normalizeOverviewSource(source: string | null | undefined): string | null {
  if (!source) return null;
  const text = source.trim();
  if (!text || isUnavailableText(text)) return null;
  return text;
}

function formatOverviewValue(
  value: string | number | null | undefined,
  {
    label,
    degraded,
  }: {
    label: string;
    degraded: boolean;
  }
): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Math.abs(value) >= 1000) {
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
    }
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  }
  if (typeof value === "string" && value.trim() && !isUnavailableText(value)) return value;
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes("market status")) {
    return degraded ? "Status delayed" : "Updating status";
  }
  if (lowerLabel.includes("volatility") || lowerLabel.includes("vix")) {
    return degraded ? "Volatility delayed" : "Updating volatility";
  }
  return degraded ? "Data delayed" : "Updating";
}

function formatOverviewDelta(
  deltaPct: number | null | undefined,
  {
    label,
    source,
    degraded,
  }: {
    label: string;
    source: string | null | undefined;
    degraded: boolean;
  }
): string {
  if (typeof deltaPct !== "number" || !Number.isFinite(deltaPct)) {
    const lowerLabel = label.toLowerCase();
    const normalizedSource = normalizeOverviewSource(source);
    if (lowerLabel.includes("market status")) {
      return degraded ? "Schedule fallback" : "Live session";
    }
    if (normalizedSource) {
      return degraded ? `${normalizedSource} delayed` : normalizedSource;
    }
    return degraded ? "Data delayed" : "Live";
  }
  const sign = deltaPct >= 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(2)}%`;
}

function toOverviewTone(
  deltaPct: number | null | undefined,
  degraded: boolean
): MarketOverviewMetric["tone"] {
  if (typeof deltaPct !== "number" || !Number.isFinite(deltaPct)) {
    return degraded ? "warning" : "neutral";
  }
  if (deltaPct > 0.25) return "positive";
  if (deltaPct < -0.25) return "negative";
  return "neutral";
}

function iconForOverview(label: string, tone: MarketOverviewMetric["tone"]): LucideIcon {
  const lower = label.toLowerCase();
  if (lower.includes("volatility") || lower.includes("vix")) return Activity;
  if (lower.includes("yield") || lower.includes("rate")) return ChartColumnIncreasing;
  if (tone === "positive") return TrendingUp;
  if (tone === "negative") return TrendingDown;
  return LineChart;
}

function findOverviewRow(
  payload: KaiHomeInsightsV2 | null,
  match: (row: NonNullable<KaiHomeInsightsV2["market_overview"]>[number]) => boolean
) {
  const rows = payload?.market_overview;
  if (!Array.isArray(rows)) return null;
  return (
    rows.find(
      (row): row is NonNullable<KaiHomeInsightsV2["market_overview"]>[number] =>
        Boolean(row) && match(row)
    ) ?? null
  );
}

function toIndexOverviewMetric(
  row: NonNullable<KaiHomeInsightsV2["market_overview"]>[number] | null,
  fallbackLabel: string
): MarketOverviewMetric {
  const degraded = !row || Boolean(row.degraded);
  const label = String(row?.label || fallbackLabel);
  const tone = toOverviewTone(row?.delta_pct, degraded);
  return {
    id: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    value: formatOverviewValue(row?.value, { label, degraded }),
    delta: formatOverviewDelta(row?.delta_pct, {
      label,
      source: row?.source,
      degraded,
    }),
    tone,
    icon: iconForOverview(label, tone),
  };
}

function toBreadthMetric(payload: KaiHomeInsightsV2 | null): MarketOverviewMetric {
  const movers = payload?.movers;
  const gainers = Array.isArray(movers?.gainers) ? movers.gainers.length : 0;
  const losers = Array.isArray(movers?.losers) ? movers.losers.length : 0;
  const degraded = Boolean(movers?.degraded) || gainers + losers === 0;
  const spread = gainers - losers;
  const trackedCount = gainers + losers;
  const tone: MarketOverviewMetric["tone"] =
    spread > 0 ? "positive" : spread < 0 ? "negative" : degraded ? "warning" : "neutral";

  let value = "Mixed tape";
  if (spread >= 4) value = "Broad participation";
  if (spread <= -4) value = "Narrow leadership";
  if (degraded && trackedCount === 0) value = "Updating";

  return {
    id: "breadth",
    label: "Advancers vs decliners",
    value,
    delta:
      trackedCount > 0
        ? `${gainers} of ${trackedCount} tracked names are higher today`
        : degraded
          ? "Breadth snapshot delayed"
          : "Awaiting breadth snapshot",
    tone,
    icon: tone === "negative" ? TrendingDown : TrendingUp,
  };
}

function toSectorLeadershipMetric(payload: KaiHomeInsightsV2 | null): MarketOverviewMetric {
  const sectorRows = Array.isArray(payload?.sector_rotation)
    ? payload.sector_rotation.filter(
        (row): row is NonNullable<KaiHomeInsightsV2["sector_rotation"]>[number] =>
          Boolean(row) && typeof row.change_pct === "number" && Number.isFinite(row.change_pct)
      )
    : [];
  const leader = [...sectorRows].sort(
    (left, right) => Number(right.change_pct || 0) - Number(left.change_pct || 0)
  )[0];
  const degraded = !leader || Boolean(leader.degraded);
  const tone = toOverviewTone(leader?.change_pct, degraded);

  return {
    id: "sector-leadership",
    label: "Sector leader",
    value: leader?.sector || (degraded ? "Updating" : "Unavailable"),
    delta:
      typeof leader?.change_pct === "number" && Number.isFinite(leader.change_pct)
        ? `${leader.change_pct >= 0 ? "+" : ""}${leader.change_pct.toFixed(2)}%`
        : degraded
          ? "Rotation delayed"
          : "No clear leader",
    tone,
    icon: ChartColumnIncreasing,
  };
}

function toOverviewMetrics(payload: KaiHomeInsightsV2 | null): MarketOverviewMetric[] {
  return [
    toIndexOverviewMetric(
      findOverviewRow(payload, (row) => String(row.label || "").toLowerCase().includes("s&p")),
      "S&P 500"
    ),
    toIndexOverviewMetric(
      findOverviewRow(payload, (row) => String(row.label || "").toLowerCase().includes("nasdaq")),
      "NASDAQ 100"
    ),
    toBreadthMetric(payload),
    toSectorLeadershipMetric(payload),
  ];
}

function hasUsefulOverviewValue(value: string | number | null | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    const text = value.trim();
    return Boolean(text) && !isUnavailableText(text);
  }
  return false;
}

function countUsableOverviewRows(payload: KaiHomeInsightsV2 | null | undefined): number {
  const rows = payload?.market_overview;
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((count, row) => {
    if (!row) return count;
    if (hasUsefulOverviewValue(row.value)) return count + 1;
    return count;
  }, 0);
}

function withStableOverviewFromCache(
  nextPayload: KaiHomeInsightsV2,
  cachedPayload: KaiHomeInsightsV2 | null
): KaiHomeInsightsV2 {
  const nextUsableCount = countUsableOverviewRows(nextPayload);
  const cachedUsableCount = countUsableOverviewRows(cachedPayload);
  if (nextUsableCount > 0 || cachedUsableCount === 0) {
    return nextPayload;
  }
  return {
    ...nextPayload,
    market_overview: cachedPayload?.market_overview ?? nextPayload.market_overview,
  };
}

function toThemeIcon(title: string): LucideIcon {
  const matched = THEME_ICON_MAP.find((row) => row.test.test(title));
  return matched?.icon || LineChart;
}

function isDummyTheme(
  theme: NonNullable<KaiHomeInsightsV2["themes"]>[number]
): boolean {
  const sourceTags = Array.isArray(theme.source_tags)
    ? theme.source_tags.map((tag) => String(tag || "").toLowerCase())
    : [];
  const hasFallbackTag = sourceTags.some((tag) =>
    tag.includes("fallback") || tag.includes("dummy")
  );
  const subtitle = String(theme.subtitle || "").trim().toLowerCase();
  const hasHeadline = Boolean(String(theme.headline || "").trim());
  return Boolean(theme.degraded) && (hasFallbackTag || (!hasHeadline && subtitle.includes("sector rotation")));
}

function toThemeItems(payload: KaiHomeInsightsV2 | null): ThemeFocusItem[] {
  const themes = payload?.themes || [];
  if (!Array.isArray(themes)) return [];
  return themes
    .filter((theme): theme is NonNullable<KaiHomeInsightsV2["themes"]>[number] => Boolean(theme))
    .filter((theme) => !isDummyTheme(theme))
    .map((theme, idx) => ({
      id: `${String(theme.title || "theme")}-${idx}`,
      title: String(theme.title || "Theme"),
      subtitle: String(theme.subtitle || "Sector focus"),
      icon: toThemeIcon(String(theme.title || "")),
    }))
    .slice(0, 3);
}

function marketStatusBadge(payload: KaiHomeInsightsV2 | null): {
  label: string;
  className: string;
} | null {
  const row = findOverviewRow(payload, (candidate) =>
    String(candidate.label || "").toLowerCase().includes("market status")
  );
  if (!row) return null;
  const value = formatOverviewValue(row.value, {
    label: String(row.label || "Market Status"),
    degraded: Boolean(row.degraded),
  });
  if (!value) return null;

  if (Boolean(row.degraded)) {
    return {
      label: value,
      className:
        "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }

  if (value.toLowerCase().includes("open")) {
    return {
      label: value,
      className:
        "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }

  return {
    label: value,
    className: "border-border/70 bg-background/80 text-muted-foreground",
  };
}

function readAnyKaiHomeCache(
  cache: CacheService,
  userId: string,
  daysBack = 7,
  pickSource = "default"
): KaiHomeInsightsV2 | null {
  const prefix = `kai_market_home_${userId}_`;
  const preferredSuffix = `_${daysBack}_${pickSource}`;
  const daySuffix = `_${daysBack}_`;
  const keys = cache
    .getStats()
    .keys.filter(
      (key) =>
        key.startsWith(prefix) &&
        (key.endsWith(preferredSuffix) || key.includes(daySuffix))
    )
    .sort((left, right) => {
      const leftPreferred = left.endsWith(preferredSuffix) ? 0 : 1;
      const rightPreferred = right.endsWith(preferredSuffix) ? 0 : 1;
      return leftPreferred - rightPreferred;
    });

  for (const key of keys) {
    const value = cache.get<KaiHomeInsightsV2>(key);
    if (value) return value;
  }
  return null;
}

function readCachedPortfolioHoldings(
  cache: CacheService,
  userId: string
): Array<Record<string, unknown>> {
  const cachedPortfolio = cache.get<Record<string, unknown>>(CACHE_KEYS.PORTFOLIO_DATA(userId));
  const nestedPortfolio =
    cachedPortfolio?.portfolio &&
    typeof cachedPortfolio.portfolio === "object" &&
    !Array.isArray(cachedPortfolio.portfolio)
      ? (cachedPortfolio.portfolio as Record<string, unknown>)
      : null;
  return (
    (Array.isArray(cachedPortfolio?.holdings) && cachedPortfolio.holdings) ||
    (Array.isArray(nestedPortfolio?.holdings) && nestedPortfolio.holdings) ||
    []
  ) as Array<Record<string, unknown>>;
}

export function KaiMarketPreviewView() {
  const { user, loading } = useAuth();
  const {
    vaultKey,
    tokenExpiresAt,
    unlockVault,
    getVaultOwnerToken,
    vaultOwnerToken,
  } = useVault();

  const [payload, setPayload] = useState<KaiHomeInsightsV2 | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePickSource, setActivePickSource] = useState("default");

  const abortRef = useRef<AbortController | null>(null);
  const hasPayloadRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastStartedAtRef = useRef(0);

  useEffect(() => {
    const nextSource = String(payload?.active_pick_source || "").trim();
    if (!nextSource || nextSource === activePickSource) return;
    setActivePickSource(nextSource);
  }, [activePickSource, payload?.active_pick_source]);

  useEffect(() => {
    setKaiActivePickSource(user?.uid, activePickSource);
  }, [activePickSource, user?.uid]);

  const resolveToken = useCallback(
    async (forceRefresh = false): Promise<string> => {
      if (!user?.uid) {
        throw new Error("Missing authenticated user");
      }
      return ensureKaiVaultOwnerToken({
        userId: user.uid,
        currentToken: getVaultOwnerToken() ?? vaultOwnerToken,
        currentExpiresAt: tokenExpiresAt,
        forceRefresh,
        onIssued: (issuedToken, expiresAt) => {
          if (vaultKey) {
            unlockVault(vaultKey, issuedToken, expiresAt);
          }
        },
      });
    },
    [getVaultOwnerToken, tokenExpiresAt, unlockVault, user?.uid, vaultKey, vaultOwnerToken]
  );

  const resolveTrackedSymbols = useCallback(() => {
    if (!user?.uid) return [];
    const cache = CacheService.getInstance();
    const sourceHoldings = readCachedPortfolioHoldings(cache, user.uid);

    return sourceHoldings
      .filter((holding) => {
        const assetType = String(holding.asset_type || "").trim().toLowerCase();
        const name = String(holding.name || "").trim().toLowerCase();
        if (assetType.includes("cash") || assetType.includes("sweep")) return false;
        if (name.includes("cash") || name.includes("sweep")) return false;
        return true;
      })
      .map((holding) => String(holding.symbol || "").trim().toUpperCase())
      .filter(
        (symbol, index, arr) =>
          Boolean(symbol) &&
          !EXCLUDED_SYMBOLS.has(symbol) &&
          !symbol.startsWith("HOLDING_") &&
          TICKER_CANDIDATE_RE.test(symbol) &&
          arr.indexOf(symbol) === index
      )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 8);
  }, [user?.uid]);

  const sessionCacheKey = useMemo(() => {
    if (!user?.uid) return null;
    return `kai_market_home_session_${user.uid}_${activePickSource}`;
  }, [activePickSource, user?.uid]);

  const persistentCacheKey = useMemo(() => {
    if (!user?.uid) return null;
    return `kai_market_home_last_known_${user.uid}_${activePickSource}`;
  }, [activePickSource, user?.uid]);

  const loadInsights = useCallback(
    async ({ forceTokenRefresh = false, manual = false }: { forceTokenRefresh?: boolean; manual?: boolean } = {}) => {
      if (loading || !user?.uid) {
        return;
      }

      const cache = CacheService.getInstance();
      let trackedSymbols = resolveTrackedSymbols();
      let symbolsKey = toSymbolsKey(trackedSymbols);
      let marketCacheKey = CACHE_KEYS.KAI_MARKET_HOME(user.uid, symbolsKey, 7, activePickSource);
      let seededFromLocalCache = false;
      if (!forceTokenRefresh && marketCacheKey) {
        const cachedPayload = cache.get<KaiHomeInsightsV2>(marketCacheKey);
        if (cachedPayload) {
          setPayload(cachedPayload);
          hasPayloadRef.current = true;
          setLoadingInitial(false);
          seededFromLocalCache = true;
        }
      }

      if (!forceTokenRefresh && !seededFromLocalCache) {
        const anyCachedPayload = readAnyKaiHomeCache(cache, user.uid, 7, activePickSource);
        if (anyCachedPayload) {
          setPayload(anyCachedPayload);
          hasPayloadRef.current = true;
          setLoadingInitial(false);
          seededFromLocalCache = true;
        }
      }

      if (
        !forceTokenRefresh &&
        !seededFromLocalCache &&
        sessionCacheKey &&
        typeof window !== "undefined"
      ) {
        try {
          const raw = getSessionItem(sessionCacheKey);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              payload?: KaiHomeInsightsV2;
              savedAt?: number;
            };
            const savedAt = Number(parsed?.savedAt || 0);
            const age = Date.now() - savedAt;
            const canUseSession =
              age >= 0 && age <= SESSION_KAI_HOME_TTL_MS && Boolean(parsed?.payload);
            if (canUseSession) {
              setPayload(parsed.payload as KaiHomeInsightsV2);
              hasPayloadRef.current = true;
              setLoadingInitial(false);
              seededFromLocalCache = true;
            }
          }
        } catch {
          // Ignore malformed session cache.
        }
      }

      if (
        !forceTokenRefresh &&
        !seededFromLocalCache &&
        isNativePlatform &&
        persistentCacheKey &&
        typeof window !== "undefined"
      ) {
        try {
          const raw = getSessionItem(persistentCacheKey);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              payload?: KaiHomeInsightsV2;
              savedAt?: number;
            };
            const savedAt = Number(parsed?.savedAt || 0);
            const age = Date.now() - savedAt;
            const canUsePersistent =
              age >= 0 &&
              age <= LAST_KNOWN_MARKET_HOME_TTL_MS &&
              Boolean(parsed?.payload);
            if (canUsePersistent) {
              setPayload(parsed.payload as KaiHomeInsightsV2);
              hasPayloadRef.current = true;
              setLoadingInitial(false);
              seededFromLocalCache = true;
            }
          }
        } catch {
          // Ignore malformed persistent cache.
        }
      }

      if (!forceTokenRefresh && !hasPayloadRef.current) {
        await UnlockWarmOrchestrator.awaitInFlightForUser(user.uid, 1_800);
        trackedSymbols = resolveTrackedSymbols();
        symbolsKey = toSymbolsKey(trackedSymbols);
        marketCacheKey = CACHE_KEYS.KAI_MARKET_HOME(user.uid, symbolsKey, 7, activePickSource);
        const warmedPayload =
          cache.get<KaiHomeInsightsV2>(marketCacheKey) ??
          readAnyKaiHomeCache(cache, user.uid, 7, activePickSource);
        if (warmedPayload) {
          setPayload(warmedPayload);
          hasPayloadRef.current = true;
          setLoadingInitial(false);
          seededFromLocalCache = true;
        }
      }

      if (seededFromLocalCache && !manual && !forceTokenRefresh) {
        return;
      }

      if (inFlightRef.current) {
        return inFlightRef.current;
      }
      const now = Date.now();
      if (!forceTokenRefresh && now - lastStartedAtRef.current < MIN_REQUEST_GAP_MS) {
        return;
      }
      lastStartedAtRef.current = now;

      const run = (async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (!hasPayloadRef.current) {
          setLoadingInitial(true);
        }
      if (manual) {
        setRefreshing(true);
      }
        setError(null);

        try {
          let token = await resolveToken(forceTokenRefresh);
          const fetchInsightsWithRetry = async (
            symbolsOverride?: string[]
          ): Promise<KaiHomeInsightsV2> => {
            try {
              return await ApiService.getKaiMarketInsights({
                userId: user.uid,
                vaultOwnerToken: token,
                symbols: symbolsOverride && symbolsOverride.length > 0 ? symbolsOverride : undefined,
                daysBack: 7,
                pickSource: activePickSource,
                signal: controller.signal,
              });
            } catch (firstError) {
              if (controller.signal.aborted) throw firstError;
              token = await resolveToken(true);
              const retried = await ApiService.getKaiMarketInsights({
                userId: user.uid,
                vaultOwnerToken: token,
                symbols: symbolsOverride && symbolsOverride.length > 0 ? symbolsOverride : undefined,
                daysBack: 7,
                pickSource: activePickSource,
                signal: controller.signal,
              });
              if (firstError instanceof Error) {
                console.warn(
                  "[KaiMarketPreviewView] Retried insights fetch after token refresh",
                  firstError.message
                );
              }
              return retried;
            }
          };

          let fallbackPayload: KaiHomeInsightsV2 | null = null;
          const hasTrackedSymbols = trackedSymbols.length > 0;
          let nextPayload: KaiHomeInsightsV2;
          try {
            nextPayload = await fetchInsightsWithRetry(hasTrackedSymbols ? trackedSymbols : undefined);
          } catch (targetedFetchError) {
            if (!hasPayloadRef.current && !manual && hasTrackedSymbols) {
              try {
                fallbackPayload = await fetchInsightsWithRetry(undefined);
                if (!controller.signal.aborted && fallbackPayload) {
                  setPayload(fallbackPayload);
                  hasPayloadRef.current = true;
                  cache.set(
                    CACHE_KEYS.KAI_MARKET_HOME(user.uid, "default", 7, activePickSource),
                    fallbackPayload,
                    MARKET_HOME_CACHE_TTL_MS
                  );
                  if (sessionCacheKey && typeof window !== "undefined") {
                    setSessionItem(
                      sessionCacheKey,
                      JSON.stringify({ payload: fallbackPayload, savedAt: Date.now() })
                    );
                  }
                  if (persistentCacheKey && typeof window !== "undefined") {
                    setSessionItem(
                      persistentCacheKey,
                      JSON.stringify({ payload: fallbackPayload, savedAt: Date.now() })
                    );
                  }
                  setLoadingInitial(false);
                }
              } catch (defaultFetchError) {
                if (defaultFetchError instanceof Error) {
                  console.warn(
                    "[KaiMarketPreviewView] Fallback default market fetch failed:",
                    defaultFetchError.message
                  );
                }
              }
            }
            if (!fallbackPayload) {
              throw targetedFetchError;
            }
            nextPayload = fallbackPayload;
          }

          if (controller.signal.aborted) return;
          const cachedBaselinePayload =
            cache.get<KaiHomeInsightsV2>(marketCacheKey) ??
            readAnyKaiHomeCache(cache, user.uid, 7, activePickSource);
          const stabilizedPayload = withStableOverviewFromCache(
            nextPayload,
            seededFromLocalCache ? cachedBaselinePayload : null
          );
          setPayload(stabilizedPayload);
          hasPayloadRef.current = true;
          cache.set(marketCacheKey, stabilizedPayload, MARKET_HOME_CACHE_TTL_MS);
          if (trackedSymbols.length === 0) {
            cache.set(
              CACHE_KEYS.KAI_MARKET_HOME(user.uid, "default", 7, activePickSource),
              stabilizedPayload,
              MARKET_HOME_CACHE_TTL_MS
            );
          }
          if (sessionCacheKey && typeof window !== "undefined") {
            setSessionItem(
              sessionCacheKey,
              JSON.stringify({ payload: stabilizedPayload, savedAt: Date.now() })
            );
          }
          if (persistentCacheKey && typeof window !== "undefined") {
            setSessionItem(
              persistentCacheKey,
              JSON.stringify({ payload: stabilizedPayload, savedAt: Date.now() })
            );
          }
        } catch (loadError) {
          if (controller.signal.aborted) return;
          const message = loadError instanceof Error ? loadError.message : "Failed to load live market insights";
          setError(message);
        } finally {
          if (!controller.signal.aborted) {
            setLoadingInitial(false);
            setRefreshing(false);
          }
        }
      })();

      inFlightRef.current = run;
      try {
        await run;
      } finally {
        if (inFlightRef.current === run) {
          inFlightRef.current = null;
        }
      }
    },
    [
      activePickSource,
      loading,
      persistentCacheKey,
      resolveToken,
      resolveTrackedSymbols,
      sessionCacheKey,
      user?.uid,
    ]
  );

  useEffect(() => {
    if (loading || !user?.uid) return;

    void loadInsights();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadInsights();
      }
    };

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadInsights();
      }
    }, POLL_INTERVAL_MS);

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
    };
  }, [loadInsights, loading, user?.uid]);

  const hasPayload = Boolean(payload);
  const overviewMetrics = useMemo(() => toOverviewMetrics(payload), [payload]);
  const marketStatus = useMemo(() => marketStatusBadge(payload), [payload]);
  const themeItems = useMemo(() => toThemeItems(payload), [payload]);
  const pickSources = useMemo<KaiHomePickSource[]>(
    () =>
      Array.isArray(payload?.pick_sources)
        ? payload.pick_sources.filter((source) => Boolean(source?.id))
        : [],
    [payload?.pick_sources]
  );
  const pickRows = useMemo(
    () =>
      Array.isArray(payload?.pick_rows)
        ? payload.pick_rows.filter((row) => Boolean(row?.symbol))
        : Array.isArray(payload?.renaissance_list)
          ? payload.renaissance_list.filter((row) => Boolean(row?.symbol))
        : [],
    [payload?.pick_rows, payload?.renaissance_list]
  );
  const spotlightRows = useMemo(
    () =>
      Array.isArray(payload?.spotlights)
        ? payload.spotlights.filter((row) => Boolean(row?.symbol)).slice(0, 2)
        : [],
    [payload?.spotlights]
  );
  const scenarioSignal = useMemo(
    () => (Array.isArray(payload?.signals) ? payload.signals[0] : undefined),
    [payload?.signals]
  );
  const showConnectPortfolio = useMemo(() => {
    if (!hasPayload) return false;
    const count = Number(payload?.hero?.holdings_count ?? 0);
    return !Number.isFinite(count) || count <= 0;
  }, [hasPayload, payload?.hero?.holdings_count]);
  const handlePickSourceChange = useCallback((nextSource: string) => {
    if (!nextSource || nextSource === activePickSource) return;
    setActivePickSource(nextSource);
  }, [activePickSource]);

  return (
    <div className="app-page-shell mx-auto w-full max-w-5xl space-y-8 overflow-x-hidden px-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Market"
        title="Explore the market with Kai"
        description="Structured market context, advisor-style picks, and compact headlines in one calm surface before you even connect a portfolio."
        icon={LineChart}
        accent="sky"
        actions={
          <Button
            variant="none"
            effect="fade"
            disabled={refreshing}
            size="sm"
            onClick={() => void loadInsights({ manual: true })}
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      />

      {loadingInitial && !hasPayload ? (
        <Card variant="muted" effect="fill" className="rounded-[24px] p-0">
          <CardContent className="space-y-3 p-5 text-left">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-sm font-semibold">Loading market snapshot...</p>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Restoring the latest available market cache while live data catches up.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card variant="muted" effect="fill" className="rounded-[24px] p-0">
          <CardContent className="space-y-3 p-5 text-left">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-semibold">
                {hasPayload ? "Failed to refresh market home" : "Failed to load market home"}
              </p>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{error}</p>
            <Button
              variant="none"
              effect="fade"
              size="sm"
              onClick={() => void loadInsights({ manual: true })}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Spotlight"
          title="Today’s spotlight"
          description="High-value names that deserve a quick read before you scan the rest of the tape."
          icon={Target}
          accent="amber"
        />
        {spotlightRows.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {spotlightRows.map((row) => (
              <SpotlightCard
                key={row.symbol}
                title={String(row.company_name || row.symbol || "Unknown")}
                price={formatSpotlightPrice(row.price)}
                decision={toSpotlightDecision(row.recommendation)}
                confidenceLabel={spotlightConfidenceLabel(row)}
                summary={summarizeSpotlight(row)}
                context={spotlightContextLabel(row)}
                contextHref={toSafeHttpUrl(row.headline_url)}
              />
            ))}
          </div>
        ) : (
          <Card variant="muted" effect="fill" className="rounded-[24px] p-0">
            <CardContent className="p-5 text-sm text-muted-foreground">
              No spotlight insights are available right now.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Pulse"
          title="Market overview"
          description="A denser read of the current tape with stronger status cues and less filler."
          icon={ChartColumnIncreasing}
          accent="sky"
          actions={
            marketStatus ? (
              <Badge variant="outline" className={cn("font-medium", marketStatus.className)}>
                {marketStatus.label}
              </Badge>
            ) : null
          }
        />
        <MarketOverviewGrid metrics={overviewMetrics} />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Advisor signals"
          title="RIA’s picks"
          description="Choose the default Kai list or any connected advisor source. Kai remembers the last active selection and uses it for market and stock comparison surfaces."
          icon={BriefcaseBusiness}
          accent="emerald"
        />
        <RiaPicksList
          rows={pickRows}
          sources={pickSources}
          activeSourceId={activePickSource}
          onSourceChange={handlePickSourceChange}
        />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Signal"
          title="Scenario simulation"
          description="One compact scenario worth keeping in mind while the market context is still warm."
          icon={Activity}
          accent="violet"
        />
        {scenarioSignal ? (
          <Card variant="none" effect="glass" className="rounded-[24px] p-0">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold tracking-tight text-foreground">
                  {scenarioSignal.title}
                </p>
                <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                  {Number.isFinite(scenarioSignal.confidence)
                    ? `${(scenarioSignal.confidence * 100).toFixed(0)}% confidence`
                    : "Signal"}
                </span>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{scenarioSignal.summary}</p>
            </CardContent>
          </Card>
        ) : (
          <Card variant="muted" effect="fill" className="rounded-[24px] p-0">
            <CardContent className="p-5 text-sm text-muted-foreground">
              Scenario insight is unavailable at the moment.
            </CardContent>
          </Card>
        )}
      </section>

      {themeItems.length > 0 ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="Narratives"
            title="Themes in focus"
            description="Compact narratives that can shape how the next debate or trade idea gets framed."
            icon={Cpu}
            accent="violet"
          />
          <ThemeFocusList themes={themeItems} />
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Headlines"
          title="News"
          description="A vertical news read that stays mobile-friendly without sideways scrolling."
          icon={Newspaper}
          accent="rose"
        />
        <NewsTape rows={payload?.news_tape || []} />
      </section>

      {showConnectPortfolio ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="Portfolio context"
            title="Bring your own positions"
            description="Connecting a portfolio makes the market page and downstream debate surfaces meaningfully more personal."
            icon={BriefcaseBusiness}
            accent="emerald"
          />
          <ConnectPortfolioCta />
        </section>
      ) : null}
    </div>
  );
}
