// components/kai/kai-flow.tsx

/**
 * Kai Flow - State-driven UI component flow for investment analysis
 *
 * Flow:
 * 1. Check World Model for financial data
 * 2. If no data -> Show portfolio import
 * 3. After import -> Show streaming progress -> Review screen -> Dashboard
 * 4. Dashboard shows KPIs, prime assets, and search bar for analysis
 * 5. Analysis view shows real-time debate streaming
 *
 * No chat interface - pure UI component flow.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { HushhLoader } from "@/components/ui/hushh-loader";
import { WorldModelService } from "@/lib/services/world-model-service";
import { normalizeStoredPortfolio } from "@/lib/utils/portfolio-normalize";
import { useCache } from "@/lib/cache/cache-context";
import { CacheSyncService } from "@/lib/cache/cache-sync-service";
import { PortfolioImportView } from "./views/portfolio-import-view";
import { ImportProgressView, ImportStage } from "./views/import-progress-view";
import { PortfolioReviewView, PortfolioData as ReviewPortfolioData } from "./views/portfolio-review-view";
import { DashboardView, PortfolioData } from "./views/dashboard-view";
import { DashboardMasterView } from "./views/dashboard-master-view";
import { AnalysisView } from "./views/analysis-view";
import { useVault } from "@/lib/vault/vault-context";
import { toast } from "sonner";
import { ApiService } from "@/lib/services/api-service";
import { getStockContext } from "@/lib/services/kai-service";
import { useKaiSession } from "@/lib/stores/kai-session-store";
import type { KaiStreamEnvelope } from "@/lib/streaming/kai-stream-types";
import { consumeCanonicalKaiStream } from "@/lib/streaming/kai-stream-client";
import { KaiPreferencesSheet } from "@/components/kai/onboarding/KaiPreferencesSheet";
import { KaiProfileSyncService } from "@/lib/services/kai-profile-sync-service";
import { useAuth } from "@/hooks/use-auth";
import { VaultFlow } from "@/components/vault/vault-flow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { setOnboardingFlowActiveCookie } from "@/lib/services/onboarding-route-cookie";
import { ROUTES } from "@/lib/navigation/routes";
import { useScrollReset } from "@/lib/navigation/use-scroll-reset";

// =============================================================================
// TYPES
// =============================================================================

export type FlowState =
  | "checking"
  | "import_required"
  | "importing"       // Streaming progress view
  | "import_complete" // Stream complete, waits for explicit user action
  | "reviewing"       // Review parsed data before saving
  | "dashboard"       // Main view with KPIs and prime assets
  | "analysis";       // Stock analysis results

interface KaiFlowProps {
  userId: string;
  vaultOwnerToken: string;
  mode: "dashboard" | "import";
  onStateChange?: (state: FlowState) => void;
  onHoldingsLoaded?: (holdings: string[]) => void;
}

interface AnalysisResult {
  symbol: string;
  decision: "BUY" | "HOLD" | "REDUCE";
  confidence: number;
  summary: string;
  fundamentalInsights?: string;
  sentimentInsights?: string;
  valuationInsights?: string;
}

interface FlowData {
  hasFinancialData: boolean;
  holdingsCount?: number;
  holdings?: string[];
  portfolioData?: PortfolioData;
  analysisResult?: AnalysisResult;
  parsedPortfolio?: ReviewPortfolioData; // Parsed but not yet saved
}

interface QualityReport {
  raw?: number;
  validated?: number;
  aggregated?: number;
  dropped?: number;
  reconciled?: number;
  mismatch_detected?: number;
  dropped_reasons?: Record<string, number>;
  unknown_name_count?: number;
  placeholder_symbol_count?: number;
  zero_qty_zero_price_nonzero_value_count?: number;
  account_header_row_count?: number;
  duplicate_symbol_lot_count?: number;
}

interface LiveHoldingPreview {
  symbol?: string;
  name?: string;
  market_value?: number | null;
  quantity?: number | null;
  asset_type?: string;
}

const USE_DASHBOARD_MASTER_VIEW = true;

// Streaming state
interface StreamingState {
  stage: ImportStage;
  stageTrail: string[];
  streamedText: string;
  totalChars: number;
  chunkCount: number;
  progressPct: number;
  statusMessage?: string;
  thoughts: string[];  // Array of thought summaries from Gemini thinking mode
  thoughtCount: number;
  qualityReport?: QualityReport;
  liveHoldings: LiveHoldingPreview[];
  holdingsExtracted: number;
  holdingsTotal?: number;
  errorMessage?: string;
}

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================

/**
 * Normalize backend portfolio data to match frontend ReviewPortfolioData interface.
 * Handles field name differences between backend (Python) and frontend (TypeScript).
 * Also handles Gemini's raw response format (account_metadata, detailed_holdings, etc.)
 */
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
  const maybe = Number(negative ? `-${sanitized}` : sanitized);
  return Number.isFinite(maybe) ? maybe : undefined;
}

function parseNumberOrZero(value: unknown): number {
  return parseMaybeNumber(value) ?? 0;
}

function firstPresent(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return undefined;
}

function normalizePortfolioData(backendData: Record<string, unknown>): ReviewPortfolioData {
  console.log("[KaiFlow] Raw backend data:", JSON.stringify(backendData, null, 2).slice(0, 2000));
  
  // Get holdings from multiple possible sources
  const rawHoldings = (
    backendData.holdings || 
    backendData.detailed_holdings || 
    []
  ) as Array<Record<string, unknown>>;
  
  // Normalize holdings - handle various field name formats
  const normalizedHoldings = rawHoldings.map((h) => {
    const symbol = String(
      firstPresent(h, ["symbol", "symbol_cusip", "ticker", "cusip", "security_id", "security"]) || ""
    ).trim();
    const name = String(
      firstPresent(h, ["name", "description", "security_name", "holding_name"]) || "Unknown"
    ).trim();
    const quantity = parseNumberOrZero(firstPresent(h, ["quantity", "shares", "units", "qty"]));
    const price = parseNumberOrZero(
      firstPresent(h, ["price", "price_per_unit", "last_price", "unit_price", "current_price"])
    );
    const marketValue = parseNumberOrZero(
      firstPresent(h, ["market_value", "current_value", "marketValue", "value", "position_value"])
    );
    const costBasis = parseMaybeNumber(firstPresent(h, ["cost_basis", "book_value", "cost", "total_cost"]));
    const unrealized = parseMaybeNumber(
      firstPresent(h, ["unrealized_gain_loss", "gain_loss", "unrealized_pnl", "pnl"])
    );
    let unrealizedPct = parseMaybeNumber(
      firstPresent(h, ["unrealized_gain_loss_pct", "gain_loss_pct", "unrealized_return_pct", "return_pct"])
    );

    // If percentage is missing but we have P/L and a reasonable denominator,
    // derive a fallback % so UI can always show something meaningful.
    if (unrealizedPct === undefined && unrealized !== undefined) {
      // Prefer cost basis as denominator when available.
      let basis: number | undefined;
      if (costBasis !== undefined && Math.abs(costBasis) > 1e-6) {
        basis = costBasis;
      } else if (marketValue !== 0) {
        basis = marketValue - unrealized;
      }

      if (basis !== undefined && Math.abs(basis) > 1e-6) {
        unrealizedPct = (unrealized / basis) * 100;
      }
    }

    return {
      symbol,
      name,
      quantity,
      price,
      market_value: marketValue,
      cost_basis: costBasis,
      unrealized_gain_loss: unrealized,
      unrealized_gain_loss_pct: unrealizedPct,
      asset_type: firstPresent(h, ["asset_type", "asset_class", "security_type", "type"])
        ? String(firstPresent(h, ["asset_type", "asset_class", "security_type", "type"]))
        : undefined,
    };
  });

  const cleanedHoldings = normalizedHoldings.filter((holding) => {
    const symbol = (holding.symbol || "").trim().toUpperCase();
    const name = (holding.name || "").trim().toLowerCase();
    const hasFinancialSignal =
      (holding.quantity ?? 0) !== 0 ||
      (holding.price ?? 0) !== 0 ||
      (holding.market_value ?? 0) !== 0;
    if (!hasFinancialSignal) return false;
    if ((symbol === "" || symbol.startsWith("HOLDING_")) && (!name || name === "unknown")) {
      return false;
    }
    if (
      (holding.quantity ?? 0) === 0 &&
      (holding.price ?? 0) === 0 &&
      (holding.market_value ?? 0) > 0 &&
      (symbol === "" || symbol.startsWith("HOLDING_"))
    ) {
      return false;
    }
    return true;
  });

  // Defensive frontend aggregation by symbol (backend should already send canonical rows).
  const aggregatedBySymbol = new Map<string, (typeof cleanedHoldings)[number] & { lots_count?: number }>();
  for (const holding of cleanedHoldings) {
    const key = (holding.symbol || "").trim().toUpperCase();
    if (!key) continue;
    const existing = aggregatedBySymbol.get(key);
    if (!existing) {
      aggregatedBySymbol.set(key, {
        ...holding,
        symbol: key,
        lots_count: 1,
      });
      continue;
    }
    existing.lots_count = (existing.lots_count || 1) + 1;
    existing.quantity = (existing.quantity || 0) + (holding.quantity || 0);
    existing.market_value = (existing.market_value || 0) + (holding.market_value || 0);
    if (holding.cost_basis !== undefined) {
      existing.cost_basis = (existing.cost_basis || 0) + (holding.cost_basis || 0);
    }
    if (holding.unrealized_gain_loss !== undefined) {
      existing.unrealized_gain_loss =
        (existing.unrealized_gain_loss || 0) + (holding.unrealized_gain_loss || 0);
    }
    if ((!existing.name || existing.name === "Unknown") && holding.name) {
      existing.name = holding.name;
    }
    if (!existing.asset_type && holding.asset_type) {
      existing.asset_type = holding.asset_type;
    }
  }
  const canonicalHoldings = Array.from(aggregatedBySymbol.values()).map((holding) => {
    const quantity = holding.quantity || 0;
    const marketValue = holding.market_value || 0;
    const nextPrice = quantity !== 0 ? marketValue / quantity : holding.price || 0;
    return {
      ...holding,
      price: nextPrice,
      market_value: marketValue,
      quantity,
    };
  });

  console.log(
    "[KaiFlow] Normalized holdings:",
    normalizedHoldings.length,
    "cleaned:",
    cleanedHoldings.length,
    "canonical:",
    canonicalHoldings.length
  );

  // Get account info from multiple possible sources
  const accountInfo = (
    backendData.account_info || 
    backendData.account_metadata
  ) as Record<string, unknown> | undefined;
  
  const normalizedAccountInfo = accountInfo ? {
    holder_name: accountInfo.holder_name || accountInfo.account_holder 
      ? String(accountInfo.holder_name || accountInfo.account_holder) 
      : undefined,
    account_number: accountInfo.account_number ? String(accountInfo.account_number) : undefined,
    account_type: accountInfo.account_type ? String(accountInfo.account_type) : undefined,
    brokerage: accountInfo.brokerage_name || accountInfo.brokerage || accountInfo.institution_name 
      ? String(accountInfo.brokerage_name || accountInfo.brokerage || accountInfo.institution_name) 
      : undefined,
    statement_period_start: accountInfo.statement_period_start ? String(accountInfo.statement_period_start) : undefined,
    statement_period_end: accountInfo.statement_period_end ? String(accountInfo.statement_period_end) : undefined,
  } : undefined;

  // Get account summary from multiple possible sources
  const accountSummary = (
    backendData.account_summary || 
    backendData.portfolio_summary
  ) as Record<string, unknown> | undefined;
  
  const normalizedAccountSummary = accountSummary ? {
    beginning_value: parseMaybeNumber(accountSummary.beginning_value),
    ending_value: parseMaybeNumber(accountSummary.ending_value),
    cash_balance: parseMaybeNumber(accountSummary.cash_balance) ?? parseMaybeNumber(backendData.cash_balance),
    equities_value: parseMaybeNumber(accountSummary.equities_value),
    change_in_value: parseMaybeNumber(accountSummary.change_in_value) ?? parseMaybeNumber(accountSummary.total_change),
  } : undefined;

  // Normalize asset_allocation
  const assetAllocation = backendData.asset_allocation as Record<string, unknown> | undefined;
  const normalizedAssetAllocation = assetAllocation ? {
    cash_pct: parseMaybeNumber(assetAllocation.cash_pct),
    cash_value: parseMaybeNumber(assetAllocation.cash_value),
    equities_pct: parseMaybeNumber(assetAllocation.equities_pct),
    equities_value: parseMaybeNumber(assetAllocation.equities_value),
    bonds_pct: parseMaybeNumber(assetAllocation.bonds_pct),
    bonds_value: parseMaybeNumber(assetAllocation.bonds_value),
  } : undefined;

  // Normalize income_summary
  const incomeSummary = backendData.income_summary as Record<string, unknown> | undefined;
  const normalizedIncomeSummary = incomeSummary ? {
    dividends_taxable: parseMaybeNumber(incomeSummary.dividends_taxable) ?? parseMaybeNumber(incomeSummary.taxable_dividends),
    interest_income: parseMaybeNumber(incomeSummary.interest_income) ?? parseMaybeNumber(incomeSummary.taxable_interest),
    total_income: parseMaybeNumber(incomeSummary.total_income),
  } : undefined;

  // Normalize realized_gain_loss
  const realizedGainLoss = backendData.realized_gain_loss as Record<string, unknown> | undefined;
  const normalizedRealizedGainLoss = realizedGainLoss ? {
    short_term_gain: parseMaybeNumber(realizedGainLoss.short_term_gain),
    long_term_gain: parseMaybeNumber(realizedGainLoss.long_term_gain),
    net_realized: parseMaybeNumber(realizedGainLoss.net_realized),
  } : undefined;

  // Calculate total_value if not provided
  let totalValue = parseMaybeNumber(backendData.total_value);
  if (totalValue === undefined || totalValue === 0) {
    // Try to derive from account_summary.ending_value
    if (normalizedAccountSummary?.ending_value) {
      totalValue = normalizedAccountSummary.ending_value;
    } else {
      // Calculate from holdings
      totalValue = normalizedHoldings.reduce((sum, h) => sum + (h.market_value || 0), 0);
    }
  }

  // Get cash_balance from multiple sources
  const cashBalance = parseMaybeNumber(backendData.cash_balance) ??
    (normalizedAccountSummary?.cash_balance !== undefined ? normalizedAccountSummary.cash_balance : undefined);

  const result: ReviewPortfolioData = {
    account_info: normalizedAccountInfo,
    account_summary: normalizedAccountSummary,
    asset_allocation: normalizedAssetAllocation,
    holdings: canonicalHoldings,
    income_summary: normalizedIncomeSummary,
    realized_gain_loss: normalizedRealizedGainLoss,
    transactions: Array.isArray(backendData.transactions)
      ? (backendData.transactions as Array<Record<string, unknown>>)
      : Array.isArray(backendData.activity_and_transactions)
        ? (backendData.activity_and_transactions as Array<Record<string, unknown>>)
        : [],
    activity_and_transactions: Array.isArray(backendData.activity_and_transactions)
      ? (backendData.activity_and_transactions as Array<Record<string, unknown>>)
      : undefined,
    cash_flow:
      backendData.cash_flow &&
      typeof backendData.cash_flow === "object" &&
      !Array.isArray(backendData.cash_flow)
        ? (backendData.cash_flow as Record<string, unknown>)
        : undefined,
    cash_management:
      backendData.cash_management &&
      typeof backendData.cash_management === "object" &&
      !Array.isArray(backendData.cash_management)
        ? (backendData.cash_management as Record<string, unknown>)
        : undefined,
    projections_and_mrd:
      backendData.projections_and_mrd &&
      typeof backendData.projections_and_mrd === "object" &&
      !Array.isArray(backendData.projections_and_mrd)
        ? (backendData.projections_and_mrd as Record<string, unknown>)
        : undefined,
    legal_and_disclosures: Array.isArray(backendData.legal_and_disclosures)
      ? (backendData.legal_and_disclosures as string[])
      : undefined,
    quality_report:
      backendData.quality_report &&
      typeof backendData.quality_report === "object" &&
      !Array.isArray(backendData.quality_report)
        ? (backendData.quality_report as Record<string, unknown>)
        : undefined,
    cash_balance: cashBalance,
    total_value: totalValue,
  };

  console.log("[KaiFlow] Final normalized data:", {
    holdingsCount: result.holdings?.length || 0,
    hasAccountInfo: !!result.account_info,
    hasAccountSummary: !!result.account_summary,
    totalValue: result.total_value,
    cashBalance: result.cash_balance,
  });

  return result;
}

function hasValidFinancialDomainData(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.holdings) || Array.isArray(record.detailed_holdings);
}

/**
 * Normalize holdings array to ensure unrealized_gain_loss_pct is computed.
 * This helper can be used in multiple places (checkFinancialData, handleSaveComplete).
 */
function normalizeHoldingsWithPct<T extends { 
  unrealized_gain_loss_pct?: number; 
  unrealized_gain_loss?: number; 
  cost_basis?: number; 
  market_value?: number;
}>(holdings: T[] | undefined): T[] | undefined {
  if (!holdings) return holdings;
  
  return holdings.map((h) => {
    // If percentage is already present and valid, keep it
    if (h.unrealized_gain_loss_pct !== undefined && h.unrealized_gain_loss_pct !== 0) {
      return h;
    }

    // Derive percentage from unrealized_gain_loss if available
    const unrealized = h.unrealized_gain_loss;
    if (unrealized !== undefined) {
      let basis: number | undefined;
      const costBasis = h.cost_basis;
      const marketValue = h.market_value || 0;

      if (costBasis !== undefined && Math.abs(costBasis) > 1e-6) {
        basis = costBasis;
      } else if (marketValue !== 0) {
        basis = marketValue - unrealized;
      }

      if (basis !== undefined && Math.abs(basis) > 1e-6) {
        return {
          ...h,
          unrealized_gain_loss_pct: (unrealized / basis) * 100,
        };
      }
    }

    return h;
  });
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function KaiFlow({
  userId,
  vaultOwnerToken,
  mode,
  onStateChange,
  onHoldingsLoaded,
}: KaiFlowProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { vaultKey, vaultOwnerToken: contextVaultOwnerToken } = useVault();
  const effectiveVaultOwnerToken = contextVaultOwnerToken ?? vaultOwnerToken;
  const { getPortfolioData, setPortfolioData, invalidateDomain } = useCache();
  const [state, setState] = useState<FlowState>("checking");
  const [flowData, setFlowData] = useState<FlowData>({
    hasFinancialData: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [preferencesSheetOpen, setPreferencesSheetOpen] = useState(false);
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [queuedUploadFile, setQueuedUploadFile] = useState<File | null>(null);
  const [resumeUploadAfterUnlock, setResumeUploadAfterUnlock] = useState(false);
  const [vaultResolvedForUpload, setVaultResolvedForUpload] = useState(false);
  const isDashboardMode = mode === "dashboard";
  const stateRef = useRef<FlowState>("checking");
  
  // Streaming state for real-time progress
  const [streaming, setStreaming] = useState<StreamingState>({
    stage: "idle",
    stageTrail: [],
    streamedText: "",
    totalChars: 0,
    chunkCount: 0,
    progressPct: 0,
    statusMessage: "Ready to import",
    thoughts: [],
    thoughtCount: 0,
    liveHoldings: [],
    holdingsExtracted: 0,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const setBusyOperation = useKaiSession((s) => s.setBusyOperation);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useScrollReset(`${mode}:${state}`, { enabled: true, behavior: "auto" });

  const handleAnalyzeLosers = useCallback(() => {
    if (!flowData.portfolioData) {
      toast.error("No portfolio data available.");
      return;
    }

    const rawHoldings = (flowData.portfolioData.holdings ||
      flowData.portfolioData.detailed_holdings ||
      []) as unknown as Array<{
      symbol?: string;
      name?: string;
      unrealized_gain_loss_pct?: number;
      unrealized_gain_loss?: number;
      market_value?: number;
      sector?: string;
      asset_type?: string;
    }>;

    const totalValue = rawHoldings.reduce(
      (sum, h) => sum + (h.market_value !== undefined ? parseNumberOrZero(h.market_value) : 0),
      0
    );

    const holdingsForOptimize = rawHoldings
      .map((h) => {
        const mv = h.market_value !== undefined ? parseMaybeNumber(h.market_value) : undefined;
        const gainLoss =
          h.unrealized_gain_loss !== undefined
            ? parseMaybeNumber(h.unrealized_gain_loss)
            : undefined;
        const gainLossPct =
          h.unrealized_gain_loss_pct !== undefined
            ? parseMaybeNumber(h.unrealized_gain_loss_pct)
            : undefined;

        const symbol = String(h.symbol || "").toUpperCase().trim();

        return {
          symbol,
          name: h.name ? String(h.name) : undefined,
          gain_loss_pct: gainLossPct,
          gain_loss: gainLoss,
          market_value: mv,
          weight_pct:
            totalValue > 0 && mv !== undefined ? (mv / totalValue) * 100 : undefined,
          sector: h.sector ? String(h.sector) : undefined,
          asset_type: h.asset_type ? String(h.asset_type) : undefined,
        };
      })
      .filter((h) => h.symbol);

    const losers = holdingsForOptimize
      .filter(
        (l) => l.gain_loss_pct === undefined || (l.gain_loss_pct as number) <= -5
      )
      .slice(0, 25);

    const forceOptimize = losers.length === 0;
    toast.info(
      "Optimizing suggestions using curated rulesets across your portfolio context."
    );

    useKaiSession.getState().setLosersInput({
      userId,
      thresholdPct: -5,
      maxPositions: 10,
      losers,
      holdings: holdingsForOptimize,
      forceOptimize,
      hadBelowThreshold: losers.length > 0,
    });

    router.push(`${ROUTES.KAI_DASHBOARD}/portfolio-health`);
  }, [flowData.portfolioData, router, userId]);

  const handleViewHistory = useCallback(() => {
    router.push(`${ROUTES.KAI_DASHBOARD}/analysis`);
  }, [router]);

  // Check World Model for financial data on mount
  useEffect(() => {
    async function checkFinancialData() {
      try {
        // Avoid resetting active import/review UI when vault state changes mid-flow.
        if (
          mode === "import" &&
          (vaultDialogOpen ||
            resumeUploadAfterUnlock ||
            !!queuedUploadFile ||
            stateRef.current === "importing" ||
            stateRef.current === "import_complete" ||
            stateRef.current === "reviewing")
        ) {
          return;
        }

        setState("checking");

        // Fetch user's World Model metadata
        const metadata = await WorldModelService.getMetadata(userId, false, effectiveVaultOwnerToken);

        // Check if financial domain exists and has data
        const financialDomain = metadata.domains.find(
          (d) => d.key === "financial"
        );

        const hasFinancialData =
          financialDomain && financialDomain.attributeCount > 0;

        if (hasFinancialData) {
          // Prefer CacheProvider (in-memory) for reuse with Manage page
          let portfolioData: PortfolioData | undefined = getPortfolioData(userId) ?? undefined;

          if (!portfolioData && vaultKey) {
            // No cache - try to decrypt from World Model
            console.log("[KaiFlow] No cache, attempting to decrypt from World Model...");
            try {
              const allData = await WorldModelService.loadFullBlob({
                userId,
                vaultKey,
                vaultOwnerToken: effectiveVaultOwnerToken,
              });
              const rawFinancial = allData.financial;
              if (!hasValidFinancialDomainData(rawFinancial)) {
                console.warn(
                  "[KaiFlow] Financial domain metadata exists but encrypted blob has no valid financial holdings shape."
                );
                toast.error("Portfolio data needs repair. Please re-import your statement.");
                setFlowData({ hasFinancialData: false });
                setState("import_required");
                return;
              }

              // Normalize Review-format → Dashboard-format field names
              portfolioData = normalizeStoredPortfolio(rawFinancial) as PortfolioData;
              console.log("[KaiFlow] Successfully decrypted portfolio data from World Model");
            } catch (decryptError) {
              // Handle encryption key mismatch or corrupted data
              console.error("[KaiFlow] Failed to decrypt from World Model:", decryptError);
              
              // Check if this is a decryption error (key mismatch)
              const errorMessage = decryptError instanceof Error ? decryptError.message : "";
              if (errorMessage.includes("decrypt") || errorMessage.includes("tag") || errorMessage.includes("authentication")) {
                console.warn("[KaiFlow] Possible encryption key mismatch - clearing cache and prompting re-import");
                invalidateDomain(userId, "financial");
                toast.error("Unable to decrypt portfolio data. Please re-import your statement.");
                setFlowData({ hasFinancialData: false });
                setState("import_required");
                return;
              }
              
              // For other errors, continue without portfolio data - user can re-import
            }
          }
          if (!portfolioData && !vaultKey) {
            // Financial metadata exists, but we cannot decrypt without a vault key.
          }

          // Ensure holdings have unrealized_gain_loss_pct computed
          // This handles data loaded from cache/World Model that may not have been normalized
          if (portfolioData?.holdings) {
            portfolioData.holdings = normalizeHoldingsWithPct(portfolioData.holdings);
            console.log("[KaiFlow] Normalized holdings with unrealized_gain_loss_pct");
          }

          // Update cache with normalized data
          if (portfolioData) {
            setPortfolioData(userId, portfolioData);
          }

          // User has financial data - show dashboard
          setFlowData({
            hasFinancialData: true,
            holdingsCount: financialDomain.attributeCount,
            portfolioData,
            holdings: portfolioData?.holdings?.map(h => h.symbol) || [],
          });
          setState(isDashboardMode ? "dashboard" : "import_required");
        } else {
          // No financial data.
          // Ensure stale frontend cache never leaks into first-time user experience.
          invalidateDomain(userId, "financial");
          setFlowData({ hasFinancialData: false });
          if (isDashboardMode) {
            router.replace(ROUTES.KAI_IMPORT);
            setState("checking");
            return;
          }
          setState("import_required");
        }
      } catch (err) {
        console.error("[KaiFlow] Error checking financial data:", err);
        // Default to import_required on error (new user)
        if (isDashboardMode) {
          router.replace(ROUTES.KAI_IMPORT);
          setState("checking");
          return;
        }
        setFlowData({ hasFinancialData: false });
        setState("import_required");
      }
    }

    checkFinancialData();
  }, [
    mode,
    userId,
    vaultKey,
    effectiveVaultOwnerToken,
    vaultDialogOpen,
    resumeUploadAfterUnlock,
    queuedUploadFile,
    getPortfolioData,
    setPortfolioData,
    invalidateDomain,
    isDashboardMode,
  ]);

  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange(state);
    }
  }, [state, onStateChange]);

  // Notify parent of holdings loaded
  useEffect(() => {
    if (onHoldingsLoaded && flowData.holdings) {
      onHoldingsLoaded(flowData.holdings);
    }
  }, [flowData.holdings, onHoldingsLoaded]);

  const handleOpenPersonalizeKai = useCallback(() => {
    if (!vaultKey || !effectiveVaultOwnerToken) {
      toast.error("Unlock your vault to edit Kai preferences.");
      return;
    }
    setPreferencesSheetOpen(true);
  }, [vaultKey, effectiveVaultOwnerToken]);

  // Production-grade disconnect: abort active streams on force-close, mobile swipe-away
  useEffect(() => {
    const abortStream = () => abortControllerRef.current?.abort();
    window.addEventListener('beforeunload', abortStream);
    window.addEventListener('pagehide', abortStream);

    let visibilityTimeout: NodeJS.Timeout | undefined;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        visibilityTimeout = setTimeout(abortStream, 5000);
      } else {
        clearTimeout(visibilityTimeout);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      abortStream();
      window.removeEventListener('beforeunload', abortStream);
      window.removeEventListener('pagehide', abortStream);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimeout(visibilityTimeout);
    };
  }, []);

  // Handle file upload with SSE streaming
  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!vaultKey || !effectiveVaultOwnerToken) {
        setQueuedUploadFile(file);
        setResumeUploadAfterUnlock(true);
        setVaultDialogOpen(true);
        toast.info("Create or unlock your vault to import this statement.");
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError("File too large. Maximum size is 10MB.");
        toast.error("File too large. Maximum size is 10MB.");
        return;
      }

      // Validate file type
      const validTypes = ["application/pdf", "text/csv", "application/vnd.ms-excel"];
      if (!validTypes.includes(file.type) && !file.name.endsWith(".csv") && !file.name.endsWith(".pdf")) {
        setError("Invalid file type. Please upload a PDF or CSV file.");
        toast.error("Invalid file type. Please upload a PDF or CSV file.");
        return;
      }

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        setState("importing");
        setError(null);
        setBusyOperation("portfolio_import_stream", true);
        
        // Reset streaming state
        setStreaming({
          stage: "uploading",
          stageTrail: ["[Uploading] Processing uploaded file..."],
          streamedText: "",
          totalChars: 0,
          chunkCount: 0,
          progressPct: 5,
          statusMessage: "Processing uploaded file...",
          thoughts: [],
          thoughtCount: 0,
          qualityReport: undefined,
          liveHoldings: [],
          holdingsExtracted: 0,
          holdingsTotal: undefined,
          errorMessage: undefined,
        });

        // Create abort controller for cancellation with timeout
        abortControllerRef.current = new AbortController();
        
        // Strict user-facing timeout for import streaming (matches backend import ceiling).
        timeoutId = setTimeout(() => {
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setError("Import timed out after 180 seconds. Please retry.");
            toast.error("Import timed out. Please try again.");
          }
        }, 180 * 1000);

        // Build form data
        const formData = new FormData();
        formData.append("file", file);
        formData.append("user_id", userId);

        let response: Response;
        try {
          response = await ApiService.importPortfolioStream({
            formData,
            vaultOwnerToken: effectiveVaultOwnerToken,
            signal: abortControllerRef.current.signal,
          });
        } catch (fetchError) {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            throw fetchError;
          }
          throw new Error("Network error. Please check your connection and try again.");
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          if (response.status === 401) {
            throw new Error("Session expired. Please refresh the page and try again.");
          } else if (response.status === 422) {
            let parsed: Record<string, unknown> | null = null;
            try {
              parsed = JSON.parse(errorText) as Record<string, unknown>;
            } catch {
              parsed = null;
            }
            const detail =
              parsed && typeof parsed.detail === "object" && parsed.detail !== null
                ? (parsed.detail as Record<string, unknown>)
                : null;
            const message =
              (detail && typeof detail.message === "string" && detail.message) ||
              "This document does not appear to be a brokerage statement.";
            throw new Error(message);
          } else if (response.status === 413) {
            throw new Error("File too large for server. Please try a smaller file.");
          } else if (response.status >= 500) {
            throw new Error("Server error. Please try again in a few moments.");
          }
          throw new Error(`Upload failed: ${response.status} - ${errorText}`);
        }

        let fullStreamedText = "";
        let fullModelTokenText = "";
        let parsedPortfolio: ReviewPortfolioData | null = null;
        const validStages = new Set<ImportStage>([
          "idle",
          "uploading",
          "indexing",
          "scanning",
          "thinking",
          "extracting",
          "parsing",
          "complete",
          "error",
        ]);
        const readNumber = (value: unknown): number | undefined =>
          typeof value === "number" && Number.isFinite(value) ? value : undefined;
        const readString = (value: unknown): string | undefined =>
          typeof value === "string" && value.trim().length > 0 ? value : undefined;
        const readHoldingsPreview = (value: unknown): LiveHoldingPreview[] | undefined => {
          if (!Array.isArray(value)) return undefined;
          const preview: LiveHoldingPreview[] = [];
          for (const row of value) {
            if (!row || typeof row !== "object" || Array.isArray(row)) continue;
            const item = row as Record<string, unknown>;
            preview.push({
              symbol: typeof item.symbol === "string" ? item.symbol : undefined,
              name: typeof item.name === "string" ? item.name : undefined,
              market_value: readNumber(item.market_value),
              quantity: readNumber(item.quantity),
              asset_type: typeof item.asset_type === "string" ? item.asset_type : undefined,
            });
          }
          return preview;
        };
        const appendTrailLine = (trail: string[], next?: string): string[] => {
          if (!next) return trail;
          const line = next.trim();
          if (!line) return trail;
          if (trail[trail.length - 1] === line) return trail;
          return [...trail, line];
        };

        await consumeCanonicalKaiStream(
          response,
          (envelope: KaiStreamEnvelope) => {
            const payload = envelope.payload as Record<string, unknown>;

            switch (envelope.event) {
              case "stage": {
                const stageValue = typeof payload.stage === "string" ? payload.stage : undefined;
                const normalizedStageValue =
                  stageValue === "analyzing" ? "scanning" : stageValue;
                const stage =
                  normalizedStageValue && validStages.has(normalizedStageValue as ImportStage)
                    ? (normalizedStageValue as ImportStage)
                    : undefined;
                if (!stage) return;

                setStreaming((prev) => ({
                  ...prev,
                  stageTrail: appendTrailLine(
                    prev.stageTrail,
                    `[${stage.toUpperCase()}] ${readString(payload.message) ?? stage}`
                  ),
                  stage,
                  totalChars: readNumber(payload.total_chars) ?? prev.totalChars,
                  chunkCount: readNumber(payload.chunk_count) ?? prev.chunkCount,
                  thoughtCount: readNumber(payload.thought_count) ?? prev.thoughtCount,
                  holdingsExtracted:
                    readNumber(payload.holdings_detected) ?? prev.holdingsExtracted,
                  liveHoldings:
                    readHoldingsPreview(payload.holdings_preview) ?? prev.liveHoldings,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                  statusMessage: readString(payload.message) ?? prev.statusMessage,
                }));
                break;
              }
              case "thinking": {
                const thought = typeof payload.thought === "string" ? payload.thought : undefined;
                setStreaming((prev) => {
                  const thoughts = thought ? [...prev.thoughts, thought] : prev.thoughts;
                  if (thought) {
                    fullModelTokenText += `${thought}\n`;
                  }
                  const trail = appendTrailLine(
                    prev.stageTrail,
                    thought ? `[THOUGHT ${thoughts.length}] ${thought}` : undefined
                  );
                  return {
                    ...prev,
                    stageTrail: trail,
                    stage: "thinking",
                    thoughts,
                    thoughtCount: readNumber(payload.count) ?? thoughts.length,
                    progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                    statusMessage: readString(payload.message) ?? prev.statusMessage,
                    streamedText: fullModelTokenText || prev.streamedText,
                  };
                });
                break;
              }
              case "chunk": {
                const text = typeof payload.text === "string" ? payload.text : "";
                if (text) {
                  fullStreamedText += text;
                  fullModelTokenText += text;
                }
                setStreaming((prev) => ({
                  ...prev,
                  stage: "extracting",
                  streamedText: fullModelTokenText || fullStreamedText,
                  totalChars: readNumber(payload.total_chars) ?? fullStreamedText.length,
                  chunkCount: readNumber(payload.chunk_count) ?? prev.chunkCount,
                  holdingsExtracted:
                    readNumber(payload.holdings_detected) ?? prev.holdingsExtracted,
                  liveHoldings:
                    readHoldingsPreview(payload.holdings_preview) ?? prev.liveHoldings,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                  statusMessage: readString(payload.message) ?? prev.statusMessage,
                }));
                break;
              }
              case "progress": {
                const preview = readHoldingsPreview(payload.holdings_preview);
                const phase = readString(payload.phase);
                const message = readString(payload.message);
                setStreaming((prev) => ({
                  ...prev,
                  stageTrail: appendTrailLine(
                    prev.stageTrail,
                    message
                      ? `[${(phase || prev.stage).toUpperCase()}] ${message}`
                      : undefined
                  ),
                  stage: phase === "parsing" ? "parsing" : prev.stage,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                  statusMessage: message ?? prev.statusMessage,
                  holdingsExtracted:
                    readNumber(payload.holdings_extracted) ?? prev.holdingsExtracted,
                  holdingsTotal: readNumber(payload.holdings_total) ?? prev.holdingsTotal,
                  liveHoldings: preview && preview.length > 0 ? preview : prev.liveHoldings,
                }));
                break;
              }
              case "warning": {
                const message = readString(payload.message);
                if (!message) break;
                setStreaming((prev) => ({
                  ...prev,
                  stageTrail: appendTrailLine(prev.stageTrail, `[WARNING] ${message}`),
                  statusMessage: message,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                }));
                break;
              }
              case "complete": {
                const rawPortfolioData = payload.portfolio_data;
                if (
                  !rawPortfolioData ||
                  typeof rawPortfolioData !== "object" ||
                  Array.isArray(rawPortfolioData)
                ) {
                  throw new Error("Missing portfolio_data in complete event");
                }
                parsedPortfolio = normalizePortfolioData(rawPortfolioData as Record<string, unknown>);

                const qualityReportRaw = (rawPortfolioData as Record<string, unknown>).quality_report;
                const qualityReport =
                  qualityReportRaw &&
                  typeof qualityReportRaw === "object" &&
                  !Array.isArray(qualityReportRaw)
                    ? (qualityReportRaw as QualityReport)
                    : undefined;

                setStreaming((prev) => ({
                  ...prev,
                  stage: "complete",
                  stageTrail: appendTrailLine(
                    prev.stageTrail,
                    `[COMPLETE] ${readString(payload.message) ?? "Import complete!"}`
                  ),
                  thoughtCount: readNumber(payload.thought_count) ?? prev.thoughtCount,
                  qualityReport,
                  holdingsExtracted:
                    parsedPortfolio?.holdings?.length ?? prev.holdingsExtracted,
                  holdingsTotal:
                    parsedPortfolio?.holdings?.length ?? prev.holdingsTotal,
                  liveHoldings:
                    (parsedPortfolio?.holdings ?? []).map((holding) => ({
                      symbol: holding.symbol,
                      name: holding.name,
                      market_value: holding.market_value,
                      quantity: holding.quantity,
                    })) || prev.liveHoldings,
                  progressPct: readNumber(payload.progress_pct) ?? 100,
                  statusMessage: readString(payload.message) ?? "Import complete!",
                  streamedText: fullModelTokenText || prev.streamedText,
                }));
                break;
              }
              case "aborted": {
                const message =
                  typeof payload.message === "string"
                    ? payload.message
                    : "Import was stopped before completion";
                setStreaming((prev) => ({
                  ...prev,
                  stage: "error",
                  stageTrail: appendTrailLine(prev.stageTrail, `[ERROR] ${message}`),
                  errorMessage: message,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                  statusMessage: message,
                }));
                throw new Error(message);
              }
              case "error": {
                const message =
                  typeof payload.message === "string"
                    ? payload.message
                    : "Import failed while parsing the statement";
                setStreaming((prev) => ({
                  ...prev,
                  stage: "error",
                  stageTrail: appendTrailLine(prev.stageTrail, `[ERROR] ${message}`),
                  errorMessage: message,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                  statusMessage: message,
                }));
                throw new Error(message);
              }
              default:
                break;
            }
          },
          {
            signal: abortControllerRef.current.signal,
            idleTimeoutMs: 180000,
            requireTerminal: true,
          }
        );

        // Check if we got portfolio data
        if (!parsedPortfolio) {
          throw new Error("No portfolio data received from parser");
        }
        const parsedPortfolioData: ReviewPortfolioData = parsedPortfolio;

        console.log("[KaiFlow] Portfolio parsed via streaming:", {
          holdings: parsedPortfolioData.holdings?.length || 0,
        });

        // Store parsed portfolio and transition to review state
        setFlowData((prev) => ({
          ...prev,
          parsedPortfolio: parsedPortfolioData,
        }));

        // Persist completion state until user explicitly continues to review.
        setState("import_complete");
        toast.success("Portfolio parsed successfully. Review when ready.");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          console.log("[KaiFlow] Import cancelled by user");
          setState("import_required");
          return;
        }

        console.error("[KaiFlow] Import error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to import portfolio. Please try again."
        );
        setStreaming((prev) => ({
          ...prev,
          stage: "error",
          stageTrail: [...prev.stageTrail, `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`],
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          statusMessage: err instanceof Error ? err.message : "Import failed",
        }));
        setState("importing");
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        setBusyOperation("portfolio_import_stream", false);
      }
    },
    [userId, effectiveVaultOwnerToken, vaultKey, setBusyOperation]
  );

  // Resume a queued upload once vault unlock/create succeeds.
  useEffect(() => {
    if (
      !resumeUploadAfterUnlock ||
      !queuedUploadFile ||
      !vaultKey ||
      !effectiveVaultOwnerToken
    ) {
      return;
    }

    setResumeUploadAfterUnlock(false);
    const file = queuedUploadFile;
    setQueuedUploadFile(null);
    void handleFileUpload(file);
  }, [
    resumeUploadAfterUnlock,
    queuedUploadFile,
    vaultKey,
    effectiveVaultOwnerToken,
    handleFileUpload,
  ]);

  // Handle cancel import
  const handleCancelImport = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setBusyOperation("portfolio_import_stream", false);
    setState(flowData.portfolioData ? "dashboard" : "import_required");
    setStreaming({
      stage: "idle",
      stageTrail: [],
      streamedText: "",
      totalChars: 0,
      chunkCount: 0,
      progressPct: 0,
      statusMessage: "Ready to import",
      thoughts: [],
      thoughtCount: 0,
      qualityReport: undefined,
      liveHoldings: [],
      holdingsExtracted: 0,
      holdingsTotal: undefined,
      errorMessage: undefined,
    });
    if (mode === "import" && flowData.portfolioData) {
      router.push(ROUTES.KAI_DASHBOARD);
      return;
    }
  }, [flowData.portfolioData, mode, router, setBusyOperation]);

  // Handle retry import after error
  const _handleRetryImport = useCallback(() => {
    setError(null);
    setStreaming({
      stage: "idle",
      stageTrail: [],
      streamedText: "",
      totalChars: 0,
      chunkCount: 0,
      progressPct: 0,
      statusMessage: "Ready to import",
      thoughts: [],
      thoughtCount: 0,
      qualityReport: undefined,
      liveHoldings: [],
      holdingsExtracted: 0,
      holdingsTotal: undefined,
      errorMessage: undefined,
    });
    setState("import_required");
  }, []);

  const handleReviewParsedPortfolio = useCallback(() => {
    if (!flowData.parsedPortfolio) {
      toast.error("Parsed portfolio not available. Please import again.");
      setState("import_required");
      return;
    }
    setState("reviewing");
  }, [flowData.parsedPortfolio]);

  const handleBackToDashboardFromImport = useCallback(() => {
    if (mode === "import") {
      setOnboardingFlowActiveCookie(false);
      router.push(ROUTES.KAI_DASHBOARD);
      return;
    }
    if (flowData.portfolioData) {
      setState("dashboard");
    } else {
      setState("import_required");
    }
  }, [flowData.portfolioData, mode, router]);

  // Handle save complete from review screen
  const handleSaveComplete = useCallback(async (savedData: ReviewPortfolioData) => {
    // Convert to dashboard format and update flow data
    // Map the review types to dashboard types
    // Normalize holdings to ensure unrealized_gain_loss_pct is computed
    const normalizedHoldings = normalizeHoldingsWithPct(savedData.holdings);
    
    const portfolioData: PortfolioData = {
      account_info: savedData.account_info ? {
        account_number: savedData.account_info.account_number,
        brokerage_name: savedData.account_info.brokerage,
        account_holder: savedData.account_info.holder_name,
      } : undefined,
      account_summary: savedData.account_summary ? {
        beginning_value: savedData.account_summary.beginning_value,
        ending_value: savedData.account_summary.ending_value || 0,
        change_in_value: savedData.account_summary.change_in_value,
        cash_balance: savedData.account_summary.cash_balance,
        equities_value: savedData.account_summary.equities_value,
      } : undefined,
      holdings: normalizedHoldings,
      transactions: [],
      asset_allocation: savedData.asset_allocation ? {
        cash_percent: savedData.asset_allocation.cash_pct,
        equities_percent: savedData.asset_allocation.equities_pct,
        bonds_percent: savedData.asset_allocation.bonds_pct,
      } : undefined,
      income_summary: savedData.income_summary ? {
        dividends: savedData.income_summary.dividends_taxable,
        interest: savedData.income_summary.interest_income,
        total: savedData.income_summary.total_income,
      } : undefined,
      realized_gain_loss: savedData.realized_gain_loss ? {
        short_term: savedData.realized_gain_loss.short_term_gain,
        long_term: savedData.realized_gain_loss.long_term_gain,
        total: savedData.realized_gain_loss.net_realized,
      } : undefined,
    };

    const holdingSymbols = normalizedHoldings?.map((h) => h.symbol) || [];

    // Update cache context so other pages (Manage, etc.) can access the data
    setPortfolioData(userId, portfolioData);
    CacheSyncService.onPortfolioUpserted(userId, portfolioData);
    console.log("[KaiFlow] Portfolio data saved to cache");

    setFlowData({
      hasFinancialData: true,
      holdingsCount: savedData.holdings?.length || 0,
      holdings: holdingSymbols,
      portfolioData,
      parsedPortfolio: undefined, // Clear parsed data
    });

    if (effectiveVaultOwnerToken && vaultKey) {
      try {
        await KaiProfileSyncService.syncPendingToVault({
          userId,
          vaultKey,
          vaultOwnerToken: effectiveVaultOwnerToken,
        });
      } catch (syncError) {
        console.warn("[KaiFlow] Deferred onboarding sync failed after save:", syncError);
      }
    }

    if (mode === "import") {
      router.push(ROUTES.KAI_DASHBOARD);
      return;
    }

    setState("dashboard");
  }, [mode, router, userId, setPortfolioData, effectiveVaultOwnerToken, vaultKey]);

  // Handle skip import - preserve existing data if available
  const handleSkipImport = useCallback(() => {
    if (mode === "import") {
      setOnboardingFlowActiveCookie(false);
      router.push(ROUTES.KAI_HOME);
      return;
    }

    setState("dashboard");
    // Only reset flowData if there's no existing portfolio data
    // This preserves data when user clicks "Upload New Statement" then skips
    if (!flowData.portfolioData) {
      setFlowData({ hasFinancialData: false });
    }
  }, [flowData.portfolioData, mode, router]);

  // Handle re-import (upload new statement)
  const handleReimport = useCallback(() => {
    if (mode === "dashboard") {
      router.push(ROUTES.KAI_IMPORT);
      return;
    }
    setState("import_required");
  }, [mode, router]);

  // Handle clear all data with confirmation
  const handleClearData = useCallback(async () => {
    // Show confirmation dialog
    const confirmed = window.confirm(
      "Are you sure you want to clear all portfolio data? This action cannot be undone."
    );
    
    if (!confirmed) {
      return;
    }
    
    try {
      // Clear World Model financial domain
      await WorldModelService.clearDomain(userId, "financial", effectiveVaultOwnerToken);
      CacheSyncService.onWorldModelDomainCleared(userId, "financial");
      
      // Reset flow state
      setFlowData({ hasFinancialData: false });
      if (mode === "dashboard") {
        router.push(ROUTES.KAI_IMPORT);
        return;
      }
      setState("import_required");
      
      toast.success("Portfolio data cleared successfully");
    } catch (err) {
      console.error("[KaiFlow] Error clearing data:", err);
      toast.error("Failed to clear data. Please try again.");
    }
  }, [mode, router, userId, effectiveVaultOwnerToken]);

  // Handle manage portfolio navigation
  const handleManagePortfolio = useCallback(() => {
    router.push(`${ROUTES.KAI_DASHBOARD}/manage`);
  }, [router]);

  // Handle analyze stock - starts streaming analysis
  const handleAnalyzeStock = useCallback((symbol: string) => {
    console.log("[KaiFlow] handleAnalyzeStock called with:", symbol);
    console.log("[KaiFlow] vaultOwnerToken present:", !!effectiveVaultOwnerToken);
    
    if (!symbol || !effectiveVaultOwnerToken) {
      toast.error("Please unlock your vault first");
      return;
    }
    
    // Get context for confirmation dialog
    getStockContext(symbol, effectiveVaultOwnerToken)
      .then((context) => {
        console.log("[KaiFlow] Context received:", context?.ticker || "no ticker");
        
        // Store analysis params in Zustand store for the analysis page
        const params = {
          ticker: symbol.toUpperCase(),
          userId,
          riskProfile: context.user_risk_profile || "balanced",
          userContext: context,
        };
        console.log("[KaiFlow] Params to store:", JSON.stringify(params));
        
        useKaiSession.getState().setAnalysisParams(params);
        
        // Navigate to analysis view (DebateStreamView will read from Zustand store)
        console.log("[KaiFlow] Navigating to /kai/dashboard/analysis");
        router.push(`${ROUTES.KAI_DASHBOARD}/analysis`);
      })
      .catch((error) => {
        console.error("[KaiFlow] Error getting context:", error);
        toast.error("Failed to analyze stock", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      });
  }, [effectiveVaultOwnerToken, userId, router]);

  // Handle back to dashboard from analysis
  const handleBackToDashboard = useCallback(() => {
    setState("dashboard");
  }, []);

  // =============================================================================
  // RENDER
  // =============================================================================

  if (state === "checking") {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <HushhLoader variant="inline" label="Checking your portfolio..." />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col">
      {/* Error display */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 dark:text-red-400">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* State-based rendering */}
      {mode === "import" && state === "import_required" && (
        <PortfolioImportView
          onFileSelect={handleFileUpload}
          onSkip={handleSkipImport}
          isUploading={false}
        />
      )}

      {mode === "import" && state === "importing" && (
        <ImportProgressView
          stage={streaming.stage}
          stageTrail={streaming.stageTrail}
          streamedText={streaming.streamedText}
          isStreaming={
            streaming.stage === "uploading" ||
            streaming.stage === "indexing" ||
            streaming.stage === "scanning" ||
            streaming.stage === "thinking" ||
            streaming.stage === "extracting" ||
            streaming.stage === "parsing"
          }
          totalChars={streaming.totalChars}
          chunkCount={streaming.chunkCount}
          progressPct={streaming.progressPct}
          statusMessage={streaming.statusMessage}
          thoughts={streaming.thoughts}
          thoughtCount={streaming.thoughtCount}
          qualityReport={streaming.qualityReport}
          liveHoldings={streaming.liveHoldings}
          holdingsExtracted={streaming.holdingsExtracted}
          holdingsTotal={streaming.holdingsTotal}
          errorMessage={streaming.errorMessage}
          onCancel={handleCancelImport}
        />
      )}

      {mode === "import" && state === "import_complete" && (
        <ImportProgressView
          stage="complete"
          stageTrail={streaming.stageTrail}
          streamedText={streaming.streamedText}
          isStreaming={false}
          totalChars={streaming.totalChars}
          chunkCount={streaming.chunkCount}
          progressPct={streaming.progressPct}
          statusMessage={streaming.statusMessage}
          thoughts={streaming.thoughts}
          thoughtCount={streaming.thoughtCount}
          qualityReport={streaming.qualityReport}
          liveHoldings={streaming.liveHoldings}
          holdingsExtracted={streaming.holdingsExtracted}
          holdingsTotal={streaming.holdingsTotal}
          onContinue={handleReviewParsedPortfolio}
          onBackToDashboard={handleBackToDashboardFromImport}
        />
      )}

      {mode === "import" && state === "reviewing" && flowData.parsedPortfolio && vaultKey && (
        <PortfolioReviewView
          portfolioData={flowData.parsedPortfolio}
          userId={userId}
          vaultKey={vaultKey}
          vaultOwnerToken={effectiveVaultOwnerToken}
          onSaveComplete={handleSaveComplete}
          onReimport={handleReimport}
          onBack={() => setState("import_required")}
        />
      )}

      {isDashboardMode && state === "dashboard" && flowData.portfolioData && (
        USE_DASHBOARD_MASTER_VIEW ? (
          <DashboardMasterView
            portfolioData={flowData.portfolioData}
            onManagePortfolio={handleManagePortfolio}
            onAnalyzeStock={handleAnalyzeStock}
            onAnalyzeLosers={handleAnalyzeLosers}
            onReupload={handleReimport}
            onViewHistory={handleViewHistory}
          />
        ) : (
          <DashboardView
            portfolioData={flowData.portfolioData}
            onManagePortfolio={handleManagePortfolio}
            onAnalyzeStock={handleAnalyzeStock}
            onAnalyzeLosers={handleAnalyzeLosers}
            onPersonalizeKai={handleOpenPersonalizeKai}
            onReupload={handleReimport}
            onClearData={handleClearData}
            onViewHistory={handleViewHistory}
          />
        )
      )}

      {isDashboardMode && state === "dashboard" && !flowData.portfolioData && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Welcome to Kai</h2>
          <p className="text-muted-foreground mb-6">
            Import your portfolio to get started with personalized investment insights.
          </p>
          <button
            onClick={handleReimport}
            className="px-6 py-3 bg-primary dark:bg-foreground text-white dark:text-black rounded-lg hover:opacity-90 transition-opacity"
          >
            Import Portfolio
          </button>
        </div>
      )}

      {isDashboardMode && state === "analysis" && flowData.analysisResult && (
        <AnalysisView
          result={flowData.analysisResult}
          onBack={handleBackToDashboard}
          onAnalyzeAnother={(symbol: string) => handleAnalyzeStock(symbol)}
        />
      )}

      {isDashboardMode && state === "analysis" && !flowData.analysisResult && (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <HushhLoader variant="inline" label="Analyzing..." />
          <p className="text-sm text-muted-foreground">
            Running debate engine analysis...
          </p>
        </div>
      )}

      {vaultKey && effectiveVaultOwnerToken && (
        <KaiPreferencesSheet
          open={preferencesSheetOpen}
          onOpenChange={setPreferencesSheetOpen}
          userId={userId}
          vaultKey={vaultKey}
          vaultOwnerToken={effectiveVaultOwnerToken}
        />
      )}

      {user && (
        <Dialog
          open={vaultDialogOpen}
          onOpenChange={(open) => {
            setVaultDialogOpen(open);
            if (!open) {
              if (vaultResolvedForUpload) {
                setVaultResolvedForUpload(false);
                return;
              }
              setQueuedUploadFile(null);
              setResumeUploadAfterUnlock(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-md p-0 border-none bg-transparent shadow-none">
            <div className="bg-background/95 backdrop-blur-xl border rounded-xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b">
                <DialogTitle className="font-semibold text-center text-base">
                  Create or unlock vault to import portfolio
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Create or unlock your vault to connect financial data to Kai.
                </DialogDescription>
              </div>
              <div className="p-4">
                <VaultFlow
                  user={user}
                  enableGeneratedDefault
                  onSuccess={() => {
                    setVaultResolvedForUpload(true);
                    setVaultDialogOpen(false);
                    if (resumeUploadAfterUnlock && queuedUploadFile) {
                      const fileToResume = queuedUploadFile;
                      if (vaultKey && effectiveVaultOwnerToken) {
                        // Restart immediately when unlock context is already available.
                        setResumeUploadAfterUnlock(false);
                        setQueuedUploadFile(null);
                        window.setTimeout(() => {
                          void handleFileUpload(fileToResume);
                        }, 120);
                      } else {
                        // Keep pending flags so the resume effect can restart once context arrives.
                        setQueuedUploadFile(fileToResume);
                        setResumeUploadAfterUnlock(true);
                      }
                    }
                  }}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
