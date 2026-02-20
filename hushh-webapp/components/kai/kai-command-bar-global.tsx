"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { KaiSearchBar } from "@/components/kai/kai-search-bar";
import { useKaiSession } from "@/lib/stores/kai-session-store";
import { CacheService, CACHE_KEYS } from "@/lib/services/cache-service";
import { morphyToast as toast } from "@/lib/morphy-ux/morphy";
import { ROUTES } from "@/lib/navigation/routes";
import { useVault } from "@/lib/vault/vault-context";

function parseMaybeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const text = String(value).trim();
  if (!text || ["n/a", "na", "null", "none", "--", "-"].includes(text.toLowerCase())) {
    return undefined;
  }
  const negative = text.startsWith("(") && text.endsWith(")");
  const sanitized = text
    .replace(/[,$\s]/g, "")
    .replace(/%/g, "")
    .replace(/[()]/g, "");
  const parsed = Number(negative ? `-${sanitized}` : sanitized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function KaiCommandBarGlobal() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { isVaultUnlocked } = useVault();
  const setAnalysisParams = useKaiSession((s) => s.setAnalysisParams);
  const setLosersInput = useKaiSession((s) => s.setLosersInput);
  const busyOperations = useKaiSession((s) => s.busyOperations);
  const cache = useMemo(() => CacheService.getInstance(), []);
  const [hasPortfolioData, setHasPortfolioData] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setHasPortfolioData(false);
      return;
    }

    const computeHasPortfolio = () => {
      const cachedPortfolio = cache.get<Record<string, unknown>>(
        CACHE_KEYS.PORTFOLIO_DATA(user.uid)
      );
      if (!cachedPortfolio || typeof cachedPortfolio !== "object") {
        setHasPortfolioData(false);
        return;
      }
      const holdings = (
        (Array.isArray(cachedPortfolio.holdings) && cachedPortfolio.holdings) ||
        (Array.isArray(cachedPortfolio.detailed_holdings) && cachedPortfolio.detailed_holdings) ||
        []
      ) as Array<Record<string, unknown>>;
      setHasPortfolioData(holdings.length > 0);
    };

    computeHasPortfolio();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type === "set" || event.type === "invalidate" || event.type === "invalidate_user" || event.type === "clear") {
        computeHasPortfolio();
      }
    });
    return unsubscribe;
  }, [cache, user?.uid]);

  const reviewScreenActive = Boolean(
    busyOperations["portfolio_review_active"] || busyOperations["portfolio_save"]
  );
  const reviewDirty = Boolean(
    busyOperations["portfolio_review_active"] && busyOperations["portfolio_review_dirty"]
  );

  // Command palette is vault-gated and hidden on review/save overlays.
  if (loading || !user || !isVaultUnlocked || reviewScreenActive) {
    return null;
  }

  if (
    pathname === ROUTES.HOME ||
    pathname.startsWith(ROUTES.LOGIN) ||
    pathname.startsWith(ROUTES.LOGOUT)
  ) {
    return null;
  }

  const userId = user.uid;

  const launchOptimizeFromCache = () => {
    const cache = CacheService.getInstance();
    const cachedPortfolio = cache.get<Record<string, unknown>>(
      CACHE_KEYS.PORTFOLIO_DATA(userId)
    );
    if (!cachedPortfolio || typeof cachedPortfolio !== "object") {
      toast.info("Import your portfolio to optimize with Kai.");
      router.push(ROUTES.KAI_IMPORT);
      return;
    }

    const sourceHoldingsRaw = (
      (Array.isArray(cachedPortfolio.holdings) && cachedPortfolio.holdings) ||
      (Array.isArray(cachedPortfolio.detailed_holdings) && cachedPortfolio.detailed_holdings) ||
      []
    ) as Array<Record<string, unknown>>;

    if (sourceHoldingsRaw.length === 0) {
      toast.info("No holdings found. Import your statement first.");
      router.push(ROUTES.KAI_IMPORT);
      return;
    }

    const totalValue = sourceHoldingsRaw.reduce((sum, holding) => {
      const mv = parseMaybeNumber(holding.market_value);
      return sum + (mv ?? 0);
    }, 0);

    const holdings = sourceHoldingsRaw
      .map((holding) => {
        const symbol = String(holding.symbol || "").trim().toUpperCase();
        if (!symbol) return null;
        const marketValue = parseMaybeNumber(holding.market_value);
        const gainLoss = parseMaybeNumber(holding.unrealized_gain_loss);
        const gainLossPct = parseMaybeNumber(holding.unrealized_gain_loss_pct);
        return {
          symbol,
          name: holding.name ? String(holding.name) : undefined,
          gain_loss_pct: gainLossPct,
          gain_loss: gainLoss,
          market_value: marketValue,
          weight_pct:
            totalValue > 0 && marketValue !== undefined
              ? (marketValue / totalValue) * 100
              : undefined,
          sector: holding.sector ? String(holding.sector) : undefined,
          asset_type: holding.asset_type ? String(holding.asset_type) : undefined,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (holdings.length === 0) {
      toast.info("No holdings found. Import your statement first.");
      router.push(ROUTES.KAI_IMPORT);
      return;
    }

    const losers = holdings
      .filter((holding) => holding.gain_loss_pct === undefined || holding.gain_loss_pct <= -5)
      .slice(0, 25);
    const forceOptimize = losers.length === 0;

    setLosersInput({
      userId,
      thresholdPct: -5,
      maxPositions: 10,
      losers,
      holdings,
      forceOptimize,
      hadBelowThreshold: losers.length > 0,
    });

    toast.info(
      "Optimizing suggestions using curated rulesets across your portfolio context."
    );
    router.push(`${ROUTES.KAI_DASHBOARD}/portfolio-health`);
  };

  return (
    <KaiSearchBar
      onCommand={(command, params) => {
        if (
          reviewDirty &&
          !window.confirm(
            "You have unsaved portfolio changes. Leaving now will discard them."
          )
        ) {
          return;
        }

        if (
          !hasPortfolioData &&
          (command === "analyze" ||
            command === "optimize" ||
            command === "history" ||
            command === "manage")
        ) {
          toast.info("Import your portfolio to unlock this command.");
          router.push(ROUTES.KAI_IMPORT);
          return;
        }

        if (command === "analyze" && params?.symbol) {
          const symbol = String(params.symbol).toUpperCase();
          setAnalysisParams({
            ticker: symbol,
            userId,
            riskProfile: "balanced",
          });
          router.push(`${ROUTES.KAI_DASHBOARD}/analysis`);
          return;
        }

        if (command === "optimize") {
          launchOptimizeFromCache();
          return;
        }

        if (command === "manage") {
          router.push(`${ROUTES.KAI_DASHBOARD}/manage`);
          return;
        }

        if (command === "history") {
          router.push(`${ROUTES.KAI_DASHBOARD}/analysis`);
          return;
        }

        if (command === "dashboard") {
          router.push(ROUTES.KAI_DASHBOARD);
          return;
        }

        if (command === "home") {
          router.push(ROUTES.KAI_HOME);
        }
      }}
      hasPortfolioData={hasPortfolioData}
    />
  );
}
