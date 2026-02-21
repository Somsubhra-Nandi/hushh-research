"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

import { HeroStrip } from "@/components/kai/home/hero-strip";
import { MoversTabs } from "@/components/kai/home/movers-tabs";
import { NewsTape } from "@/components/kai/home/news-tape";
import { SectorRotationCard } from "@/components/kai/home/sector-rotation-card";
import { SignalChips } from "@/components/kai/home/signal-chips";
import { WatchlistStrip } from "@/components/kai/home/watchlist-strip";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/lib/morphy-ux/button";
import { Card, CardContent } from "@/lib/morphy-ux/card";
import { CacheService, CACHE_KEYS } from "@/lib/services/cache-service";
import { ensureKaiVaultOwnerToken } from "@/lib/services/kai-token-guard";
import { ApiService, type KaiHomeInsightsV2 } from "@/lib/services/api-service";
import { UnlockWarmOrchestrator } from "@/lib/services/unlock-warm-orchestrator";
import { useVault } from "@/lib/vault/vault-context";
import { cn } from "@/lib/utils";

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-3 pl-1 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </h2>
  );
}

const POLL_INTERVAL_MS = 600_000;
const MIN_REQUEST_GAP_MS = 2_500;
const MARKET_HOME_CACHE_TTL_MS = 600_000;
const SESSION_KAI_HOME_TTL_MS = 600_000;
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

function readAnyKaiHomeCache(cache: CacheService, userId: string, daysBack = 7): KaiHomeInsightsV2 | null {
  const prefix = `kai_market_home_${userId}_`;
  const suffix = `_${daysBack}`;
  const keys = cache
    .getStats()
    .keys.filter((key) => key.startsWith(prefix) && key.endsWith(suffix));

  for (const key of keys) {
    const value = cache.get<KaiHomeInsightsV2>(key);
    if (value) return value;
  }
  return null;
}

export function KaiMarketPreviewView() {
  const router = useRouter();
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

  const abortRef = useRef<AbortController | null>(null);
  const hasPayloadRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastStartedAtRef = useRef(0);

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
    const cachedPortfolio = cache.get<Record<string, unknown>>(CACHE_KEYS.PORTFOLIO_DATA(user.uid));
    const sourceHoldings = (
      (Array.isArray(cachedPortfolio?.holdings) && cachedPortfolio.holdings) ||
      (Array.isArray(cachedPortfolio?.detailed_holdings) && cachedPortfolio.detailed_holdings) ||
      []
    ) as Array<Record<string, unknown>>;

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
      .slice(0, 8);
  }, [user?.uid]);
  const sessionCacheKey = useMemo(() => {
    if (!user?.uid) return null;
    return `kai_market_home_session_${user.uid}`;
  }, [user?.uid]);

  const loadInsights = useCallback(
    async ({ forceTokenRefresh = false, manual = false }: { forceTokenRefresh?: boolean; manual?: boolean } = {}) => {
      if (loading || !user?.uid) {
        return;
      }

      const cache = CacheService.getInstance();
      const trackedSymbols = resolveTrackedSymbols();
      const symbolsKey = trackedSymbols.length > 0 ? trackedSymbols.join("-") : "default";
      const marketCacheKey = CACHE_KEYS.KAI_MARKET_HOME(user.uid, symbolsKey, 7);
      if (!forceTokenRefresh && marketCacheKey) {
        const cachedPayload = cache.get<KaiHomeInsightsV2>(marketCacheKey);
        if (cachedPayload) {
          setPayload(cachedPayload);
          hasPayloadRef.current = true;
          setLoadingInitial(false);
          return;
        }
      }

      if (!forceTokenRefresh) {
        const anyCachedPayload = readAnyKaiHomeCache(cache, user.uid, 7);
        if (anyCachedPayload) {
          setPayload(anyCachedPayload);
          hasPayloadRef.current = true;
          setLoadingInitial(false);
          return;
        }
      }

      if (!forceTokenRefresh && sessionCacheKey && typeof window !== "undefined") {
        try {
          const raw = window.sessionStorage.getItem(sessionCacheKey);
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
              return;
            }
          }
        } catch {
          // Ignore malformed session cache.
        }
      }

      if (!forceTokenRefresh && trackedSymbols.length === 0) {
        await UnlockWarmOrchestrator.awaitInFlightForUser(user.uid, 1_800);
        const warmedPayload =
          cache.get<KaiHomeInsightsV2>(marketCacheKey) ?? readAnyKaiHomeCache(cache, user.uid, 7);
        if (warmedPayload) {
          setPayload(warmedPayload);
          hasPayloadRef.current = true;
          setLoadingInitial(false);
          return;
        }
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
        if (manual || hasPayloadRef.current) {
          setRefreshing(true);
        }
        setError(null);

        try {
          let token = await resolveToken(forceTokenRefresh);
          let nextPayload: KaiHomeInsightsV2;

          try {
            nextPayload = await ApiService.getKaiMarketInsights({
              userId: user.uid,
              vaultOwnerToken: token,
              symbols: trackedSymbols,
              daysBack: 7,
              signal: controller.signal,
            });
          } catch (firstError) {
            if (controller.signal.aborted) return;
            token = await resolveToken(true);
            nextPayload = await ApiService.getKaiMarketInsights({
              userId: user.uid,
              vaultOwnerToken: token,
              symbols: trackedSymbols,
              daysBack: 7,
              signal: controller.signal,
            });
            if (firstError instanceof Error) {
              console.warn("[KaiMarketPreviewView] Retried insights fetch after token refresh", firstError.message);
            }
          }

          if (controller.signal.aborted) return;
          setPayload(nextPayload);
          hasPayloadRef.current = true;
          cache.set(marketCacheKey, nextPayload, MARKET_HOME_CACHE_TTL_MS);
          if (sessionCacheKey && typeof window !== "undefined") {
            window.sessionStorage.setItem(
              sessionCacheKey,
              JSON.stringify({ payload: nextPayload, savedAt: Date.now() })
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
    [loading, resolveToken, resolveTrackedSymbols, sessionCacheKey, user?.uid]
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

  const stale = Boolean(payload?.meta?.stale ?? payload?.stale);
  const hasPayload = Boolean(payload);
  const hasRefreshError = Boolean(error);
  const effectiveDegraded = stale || hasRefreshError;
  const statusMessage = loadingInitial
    ? "Loading live insights..."
    : hasRefreshError
      ? hasPayload
        ? "Showing cached data while refresh retries."
        : "Live feeds are temporarily unavailable. Tap retry to reconnect."
      : stale
        ? "Showing partial data while provider feeds recover."
        : "Live feeds are healthy.";

  return (
    <div className="mx-auto w-full max-w-md px-4 py-7 pb-[calc(148px+var(--app-bottom-inset))]">
      <header className="space-y-3 text-center">
        <h1 className="text-2xl font-black tracking-tight leading-tight">Kai Market Home</h1>
        <p className="mx-auto max-w-[22rem] text-sm text-muted-foreground">
          Live, provider-backed market context with explicit fallback provenance.
        </p>
        <p
          className={cn(
            "mx-auto text-xs",
            effectiveDegraded ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          )}
        >
          {statusMessage}
        </p>
      </header>

      <section className="mt-7">
        <HeroStrip
          hero={payload?.hero}
          stale={effectiveDegraded}
          refreshing={refreshing}
          onRefresh={() => void loadInsights({ manual: true })}
          onOpenDashboard={() => router.push("/kai/dashboard")}
        />
      </section>

      {error ? (
        <section className="mt-7">
          <Card variant="muted" effect="fill" className="rounded-xl p-0">
            <CardContent className="space-y-3 p-4 text-left">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm font-semibold">
                  {hasPayload ? "Failed to refresh market home" : "Failed to load market home"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button variant="none" effect="fade" size="sm" onClick={() => void loadInsights({ manual: true })}>
                Retry
              </Button>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="mt-10">
        <SectionLabel>Top Holdings / Watchlist</SectionLabel>
        <WatchlistStrip items={payload?.watchlist || []} />
      </section>

      <section className="mt-10">
        <MoversTabs movers={payload?.movers} />
      </section>

      <section className="mt-10">
        <SectorRotationCard rows={payload?.sector_rotation || []} />
      </section>

      <section className="mt-10">
        <SectionLabel>News Tape</SectionLabel>
        <NewsTape rows={payload?.news_tape || []} />
      </section>

      <section className="mt-10">
        <SectionLabel>Signal Chips</SectionLabel>
        <SignalChips signals={payload?.signals || []} />
      </section>
    </div>
  );
}
