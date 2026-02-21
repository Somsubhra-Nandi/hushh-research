"use client";

import { ApiService } from "@/lib/services/api-service";
import { CacheService, CACHE_KEYS } from "@/lib/services/cache-service";
import { CacheSyncService } from "@/lib/cache/cache-sync-service";
import { KaiProfileSyncService } from "@/lib/services/kai-profile-sync-service";
import { WorldModelService } from "@/lib/services/world-model-service";
import { normalizeStoredPortfolio } from "@/lib/utils/portfolio-normalize";

export type UnlockWarmResult = {
  onboardingSynced: boolean;
  metadataWarmed: boolean;
  financialWarmed: boolean;
  kaiMarketWarmed: boolean;
  consentsWarmed: boolean;
  vaultStatusWarmed: boolean;
};

const WARM_CACHE_TTL_MS = 10 * 60 * 1000;
const RECENT_WARM_RESULT_TTL_MS = 10 * 60 * 1000;
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

function deriveTrackedSymbols(portfolio: Record<string, unknown>): string[] {
  const holdings = (
    (Array.isArray(portfolio.holdings) && portfolio.holdings) ||
    (Array.isArray(portfolio.detailed_holdings) && portfolio.detailed_holdings) ||
    []
  ) as Array<Record<string, unknown>>;

  return holdings
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
}

export class UnlockWarmOrchestrator {
  private static inFlightBySignature = new Map<string, Promise<UnlockWarmResult>>();
  private static inFlightByUser = new Map<string, Promise<UnlockWarmResult>>();
  private static recentResultBySignature = new Map<
    string,
    { completedAt: number; result: UnlockWarmResult }
  >();

  static async awaitInFlightForUser(
    userId: string,
    timeoutMs = 2_000
  ): Promise<UnlockWarmResult | null> {
    const existing = this.inFlightByUser.get(userId);
    if (!existing) return null;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        existing,
        new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  static async run(params: {
    userId: string;
    vaultKey: string;
    vaultOwnerToken: string;
  }): Promise<UnlockWarmResult> {
    const tokenSignature = params.vaultOwnerToken.slice(0, 24);
    const signature = `${params.userId}:${tokenSignature}`;
    const now = Date.now();

    const recent = this.recentResultBySignature.get(signature);
    if (recent && now - recent.completedAt <= RECENT_WARM_RESULT_TTL_MS) {
      return recent.result;
    }

    const existing = this.inFlightBySignature.get(signature);
    if (existing) {
      return existing;
    }

    const promise = this.runInternal(params)
      .then((result) => {
        this.recentResultBySignature.set(signature, {
          completedAt: Date.now(),
          result,
        });
        return result;
      })
      .finally(() => {
        this.inFlightBySignature.delete(signature);
        const currentByUser = this.inFlightByUser.get(params.userId);
        if (currentByUser === promise) {
          this.inFlightByUser.delete(params.userId);
        }
      });

    this.inFlightBySignature.set(signature, promise);
    this.inFlightByUser.set(params.userId, promise);
    return promise;
  }

  private static async runInternal(params: {
    userId: string;
    vaultKey: string;
    vaultOwnerToken: string;
  }): Promise<UnlockWarmResult> {
    const cache = CacheService.getInstance();
    const result: UnlockWarmResult = {
      onboardingSynced: false,
      metadataWarmed: false,
      financialWarmed: false,
      kaiMarketWarmed: false,
      consentsWarmed: false,
      vaultStatusWarmed: false,
    };

    try {
      const syncResult = await KaiProfileSyncService.syncPendingToVault({
        userId: params.userId,
        vaultKey: params.vaultKey,
        vaultOwnerToken: params.vaultOwnerToken,
      });
      result.onboardingSynced = syncResult.synced;
    } catch (error) {
      console.warn("[UnlockWarmOrchestrator] Pending onboarding sync failed:", error);
    }

    const [
      metadataResult,
      vaultStatusResult,
      consentsResult,
      pendingResult,
      auditResult,
      fullBlobResult,
    ] = await Promise.allSettled([
      WorldModelService.getMetadata(params.userId, false, params.vaultOwnerToken),
      ApiService.getVaultStatus(params.userId, params.vaultOwnerToken),
      ApiService.getActiveConsents(params.userId, params.vaultOwnerToken),
      ApiService.getPendingConsents(params.userId, params.vaultOwnerToken),
      ApiService.getConsentHistory(params.userId, params.vaultOwnerToken, 1, 50),
      WorldModelService.loadFullBlob({
        userId: params.userId,
        vaultKey: params.vaultKey,
        vaultOwnerToken: params.vaultOwnerToken,
      }),
    ]);

    result.metadataWarmed = metadataResult.status === "fulfilled";

    if (vaultStatusResult.status === "fulfilled" && vaultStatusResult.value.ok) {
      const statusData = await vaultStatusResult.value.json();
      cache.set(CACHE_KEYS.VAULT_STATUS(params.userId), statusData, WARM_CACHE_TTL_MS);
      result.vaultStatusWarmed = true;
    }

    if (consentsResult.status === "fulfilled" && consentsResult.value.ok) {
      const consentsData = await consentsResult.value.json();
      cache.set(CACHE_KEYS.ACTIVE_CONSENTS(params.userId), consentsData.active || [], WARM_CACHE_TTL_MS);
      result.consentsWarmed = true;
    }

    if (pendingResult.status === "fulfilled" && pendingResult.value.ok) {
      const pendingData = (await pendingResult.value.json()).pending || [];
      cache.set(CACHE_KEYS.PENDING_CONSENTS(params.userId), pendingData, WARM_CACHE_TTL_MS);
      result.consentsWarmed = true;
    }

    if (auditResult.status === "fulfilled" && auditResult.value.ok) {
      const data = await auditResult.value.json();
      const auditData = Array.isArray(data) ? data : data?.items ?? data?.history ?? [];
      cache.set(CACHE_KEYS.CONSENT_AUDIT_LOG(params.userId), auditData, WARM_CACHE_TTL_MS);
      result.consentsWarmed = true;
    }

    let symbols: string[] = [];
    if (fullBlobResult.status === "fulfilled") {
      const fullBlob = fullBlobResult.value;
      const financialRaw = fullBlob?.financial;
      if (financialRaw && typeof financialRaw === "object" && !Array.isArray(financialRaw)) {
        const normalized = normalizeStoredPortfolio(financialRaw as Record<string, unknown>);
        CacheSyncService.onPortfolioUpserted(params.userId, normalized, {
          invalidateMetadata: false,
        });
        result.financialWarmed = true;
        symbols = deriveTrackedSymbols(normalized as Record<string, unknown>);
      }
    }

    const symbolsKey = symbols.length > 0 ? symbols.join("-") : "default";
    try {
      const kaiHome = await ApiService.getKaiMarketInsights({
        userId: params.userId,
        vaultOwnerToken: params.vaultOwnerToken,
        symbols: symbols.length > 0 ? symbols : undefined,
        daysBack: 7,
      });
      cache.set(CACHE_KEYS.KAI_MARKET_HOME(params.userId, symbolsKey, 7), kaiHome, WARM_CACHE_TTL_MS);
      if (symbols.length === 0) {
        cache.set(CACHE_KEYS.KAI_MARKET_HOME(params.userId, "default", 7), kaiHome, WARM_CACHE_TTL_MS);
      }
      result.kaiMarketWarmed = true;
    } catch (error) {
      console.warn("[UnlockWarmOrchestrator] Kai market warm-up failed:", error);
    }

    return result;
  }
}
