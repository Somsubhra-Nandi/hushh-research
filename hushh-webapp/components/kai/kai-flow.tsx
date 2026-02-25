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
import { HushhLoader } from "@/components/app-ui/hushh-loader";
import { WorldModelService } from "@/lib/services/world-model-service";
import { normalizeStoredPortfolio } from "@/lib/utils/portfolio-normalize";
import { useCache } from "@/lib/cache/cache-context";
import { CacheSyncService } from "@/lib/cache/cache-sync-service";
import { PortfolioImportView } from "./views/portfolio-import-view";
import { ImportProgressView, ImportStage } from "./views/import-progress-view";
import { PortfolioReviewView, PortfolioData as ReviewPortfolioData } from "./views/portfolio-review-view";
import type { PortfolioData } from "./types/portfolio";
import { DashboardMasterView } from "./views/dashboard-master-view";
import { AnalysisView } from "./views/analysis-view";
import { useVault } from "@/lib/vault/vault-context";
import { toast } from "sonner";
import { ApiService } from "@/lib/services/api-service";
import { getStockContext } from "@/lib/services/kai-service";
import { useKaiSession } from "@/lib/stores/kai-session-store";
import type { KaiStreamEnvelope } from "@/lib/streaming/kai-stream-types";
import { consumeCanonicalKaiStream } from "@/lib/streaming/kai-stream-client";
import { KaiProfileSyncService } from "@/lib/services/kai-profile-sync-service";
import { setOnboardingFlowActiveCookie } from "@/lib/services/onboarding-route-cookie";
import { ROUTES } from "@/lib/navigation/routes";
import { useScrollReset } from "@/lib/navigation/use-scroll-reset";
import { KAI_PORTFOLIO_IMPORT_IDLE_TIMEOUT_MS } from "@/lib/services/kai-import-stream-config";
import { fetchDemoPortfolioTemplateAsset } from "@/lib/services/demo-mode-template-service";
import { useAuth } from "@/hooks/use-auth";
import { VaultFlow } from "@/components/vault/vault-flow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

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
  schema_version?: number;
  raw_count?: number;
  validated_count?: number;
  aggregated_count?: number;
  holdings_count?: number;
  investable_positions_count?: number;
  cash_positions_count?: number;
  allocation_coverage_pct?: number;
  symbol_trust_coverage_pct?: number;
  parser_quality_score?: number;
  diagnostics?: Record<string, unknown>;
  dropped_reasons?: Record<string, number>;
  quality_gate?: Record<string, unknown>;
}

interface LiveHoldingPreview {
  symbol?: string;
  name?: string;
  market_value?: number | null;
  quantity?: number | null;
  asset_type?: string;
}

// Streaming state
interface StreamingState {
  stage: ImportStage;
  stageTrail: string[];
  rawStreamLines: string[];
  streamedText: string;
  totalChars: number;
  chunkCount: number;
  progressPct?: number;
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
 * Normalize V2 backend portfolio data to match frontend ReviewPortfolioData interface.
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

function compactRecord<T extends Record<string, unknown>>(value: T | undefined): T | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value).filter(([, entryValue]) => {
    if (entryValue === undefined || entryValue === null) return false;
    if (typeof entryValue === "string" && entryValue.trim().length === 0) return false;
    return true;
  });
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as T;
}

const TRADE_ACTION_SYMBOLS = new Set([
  "BUY",
  "SELL",
  "REINVEST",
  "DIVIDEND",
  "INTEREST",
  "TRANSFER",
  "WITHDRAWAL",
  "DEPOSIT",
]);

const CASH_EQUIVALENT_SYMBOLS = new Set(["CASH", "MMF", "SWEEP", "QACDS"]);
const MAX_RAW_STREAM_LINES = 350;

function normalizeTickerSymbol(
  value: unknown,
  opts?: { name?: string; assetType?: string }
): string {
  if (value === null || value === undefined) return "";
  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");
  if (!normalized || normalized.startsWith("HOLDING_")) return "";
  if (TRADE_ACTION_SYMBOLS.has(normalized)) return "";
  if (CASH_EQUIVALENT_SYMBOLS.has(normalized)) return "CASH";
  const nameLc = String(opts?.name || "").trim().toLowerCase();
  const assetTypeLc = String(opts?.assetType || "").trim().toLowerCase();
  if (
    nameLc.includes("cash") ||
    nameLc.includes("sweep") ||
    assetTypeLc.includes("cash") ||
    assetTypeLc.includes("sweep") ||
    assetTypeLc.includes("money market")
  ) {
    return "CASH";
  }
  return normalized;
}

function normalizeRawStreamLine(input: string): string {
  const stripped = String(input || "")
    .replace(/```(?:json)?/gi, " ")
    .replace(/```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped;
}

function rawStreamLineKey(line: string): string {
  const normalized = normalizeRawStreamLine(line);
  const match = normalized.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return normalized.toLowerCase();
  const tag = (match[1] || "").trim().toUpperCase();
  const message = (match[2] || "").trim().toLowerCase();
  return `[${tag}] ${message}`;
}

function appendRawStreamLines(
  current: string[],
  incoming: string[] | undefined,
): string[] {
  if (!incoming || incoming.length === 0) return current;
  let next = current;
  for (const raw of incoming) {
    const line = normalizeRawStreamLine(raw);
    if (!line) continue;
    if (next.length > 0) {
      const prevLine = next[next.length - 1];
      if (prevLine && rawStreamLineKey(prevLine) === rawStreamLineKey(line)) {
        continue;
      }
    }
    next = [...next, line];
    if (next.length > MAX_RAW_STREAM_LINES) {
      next = next.slice(next.length - MAX_RAW_STREAM_LINES);
    }
  }
  return next;
}

function normalizePortfolioData(backendData: Record<string, unknown>): ReviewPortfolioData {
  const normalized = normalizeStoredPortfolio(backendData as Record<string, unknown>) as ReviewPortfolioData;
  const rawHoldings = Array.isArray(normalized.holdings) ? normalized.holdings : [];
  const canonicalHoldings = rawHoldings
    .map((h) => ({
      ...h,
      symbol: normalizeTickerSymbol(h.symbol, {
        name: h.name,
        assetType: h.asset_type,
      }),
      quantity: parseNumberOrZero(h.quantity),
      price: parseNumberOrZero(h.price),
      market_value: parseNumberOrZero(h.market_value),
      cost_basis: parseMaybeNumber(h.cost_basis),
      unrealized_gain_loss: parseMaybeNumber(h.unrealized_gain_loss),
      unrealized_gain_loss_pct: parseMaybeNumber(h.unrealized_gain_loss_pct),
    }))
    .filter((h) => Boolean((h.symbol || "").trim()));

  const accountSummary = normalized.account_summary || {};
  const totalValue =
    parseMaybeNumber(normalized.total_value) ??
    parseMaybeNumber(accountSummary.ending_value) ??
    canonicalHoldings.reduce((sum, h) => sum + (h.market_value || 0), 0);
  const cashBalance =
    parseMaybeNumber(normalized.cash_balance) ??
    parseMaybeNumber(accountSummary.cash_balance);

  const result: ReviewPortfolioData = {
    ...normalized,
    account_info:
      normalized.account_info && typeof normalized.account_info === "object"
        ? ({
            ...(normalized.account_info as Record<string, unknown>),
            holder_name:
              (normalized.account_info as Record<string, unknown>).holder_name ??
              (normalized.account_info as Record<string, unknown>).account_holder,
            brokerage:
              (normalized.account_info as Record<string, unknown>).brokerage ??
              (normalized.account_info as Record<string, unknown>).brokerage_name,
          } as ReviewPortfolioData["account_info"])
        : normalized.account_info,
    holdings: canonicalHoldings,
    quality_report_v2: compactRecord(
      normalized.quality_report_v2 && typeof normalized.quality_report_v2 === "object"
        ? ({
            ...(normalized.quality_report_v2 as Record<string, unknown>),
          } as Record<string, unknown>)
        : undefined
    ),
    cash_balance: cashBalance,
    total_value: totalValue,
    parse_fallback: normalized.parse_fallback === true,
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
  const portfolio = record.portfolio;
  if (portfolio && typeof portfolio === "object" && !Array.isArray(portfolio)) {
    const portfolioRecord = portfolio as Record<string, unknown>;
    return Array.isArray(portfolioRecord.holdings);
  }
  return false;
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

function isReviewPortfolioData(value: unknown): value is ReviewPortfolioData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.holdings);
}

async function fetchDemoModePortfolioTemplate(
  _vaultOwnerToken?: string
): Promise<ReviewPortfolioData> {
  const payload = await fetchDemoPortfolioTemplateAsset();
  if (!isReviewPortfolioData(payload)) {
    throw new Error("Demo template is invalid.");
  }

  const normalized = normalizePortfolioData(payload as Record<string, unknown>);
  if (!Array.isArray(normalized.holdings) || normalized.holdings.length === 0) {
    throw new Error("Demo template has no holdings.");
  }

  return normalized;
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
  const initialVaultOwnerToken = vaultOwnerToken.trim().length > 0 ? vaultOwnerToken : null;
  const effectiveVaultOwnerToken =
    contextVaultOwnerToken || initialVaultOwnerToken || undefined;
  const { getPortfolioData, setPortfolioData, invalidateDomain } = useCache();
  const [state, setState] = useState<FlowState>("checking");
  const [flowData, setFlowData] = useState<FlowData>({
    hasFinancialData: false,
  });
  const [error, setError] = useState<string | null>(null);
  const isDashboardMode = mode === "dashboard";
  const stateRef = useRef<FlowState>("checking");
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [resumeImportAfterVault, setResumeImportAfterVault] = useState(false);
  const [pendingSchemaPreload, setPendingSchemaPreload] = useState(false);
  const [resumePreloadAfterVault, setResumePreloadAfterVault] = useState(false);
  const [isPreloadingSchema, setIsPreloadingSchema] = useState(false);
  
  // Streaming state for real-time progress
  const [streaming, setStreaming] = useState<StreamingState>({
    stage: "idle",
    stageTrail: [],
    rawStreamLines: [],
    streamedText: "",
    totalChars: 0,
    chunkCount: 0,
    progressPct: undefined,
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isDashboardMode) return;

    const handlePortfolioSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail || detail.userId !== userId) return;

      const cachedPortfolioData = getPortfolioData(userId) ?? undefined;
      const hasCachedPortfolioData = Boolean(
        cachedPortfolioData &&
          Array.isArray(cachedPortfolioData.holdings) &&
          cachedPortfolioData.holdings.length > 0
      );
      if (!hasCachedPortfolioData || !cachedPortfolioData) return;

      const normalizedCachedHoldings = normalizeHoldingsWithPct(
        cachedPortfolioData.holdings
      );
      const normalizedCachedPortfolio: PortfolioData = {
        ...cachedPortfolioData,
        holdings: normalizedCachedHoldings,
      };
      setPortfolioData(userId, normalizedCachedPortfolio);
      setFlowData({
        hasFinancialData: true,
        holdingsCount: normalizedCachedPortfolio.holdings?.length || 0,
        portfolioData: normalizedCachedPortfolio,
        holdings: normalizedCachedPortfolio.holdings?.map((h) => h.symbol) || [],
      });
      setState("dashboard");
    };

    window.addEventListener("kai:portfolio-saved", handlePortfolioSaved);
    return () => {
      window.removeEventListener("kai:portfolio-saved", handlePortfolioSaved);
    };
  }, [getPortfolioData, isDashboardMode, setPortfolioData, userId]);

  // Check World Model for financial data on mount
  useEffect(() => {
    async function checkFinancialData() {
      try {
        // Import route should only perform this check during initial bootstrap.
        // Re-running on vault token/key transitions can reset active import progress.
        if (mode === "import" && stateRef.current !== "checking") {
          return;
        }

        // Avoid resetting active import/review UI when vault state changes mid-flow.
        if (
          vaultDialogOpen ||
          stateRef.current === "importing" ||
          stateRef.current === "import_complete" ||
          stateRef.current === "reviewing"
        ) {
          return;
        }

        setState("checking");

        const cachedPortfolioData = getPortfolioData(userId) ?? undefined;
        const hasCachedPortfolioData = Boolean(
          cachedPortfolioData &&
            Array.isArray(cachedPortfolioData.holdings) &&
            cachedPortfolioData.holdings.length > 0
        );

        // Dashboard-first UX: use trusted in-memory cache immediately and avoid
        // blocking on metadata/blob reads when holdings already exist locally.
        if (isDashboardMode && hasCachedPortfolioData && cachedPortfolioData) {
          const normalizedCachedHoldings = normalizeHoldingsWithPct(
            cachedPortfolioData.holdings
          );
          const normalizedCachedPortfolio: PortfolioData = {
            ...cachedPortfolioData,
            holdings: normalizedCachedHoldings,
          };
          setPortfolioData(userId, normalizedCachedPortfolio);
          setFlowData({
            hasFinancialData: true,
            holdingsCount: normalizedCachedPortfolio.holdings?.length || 0,
            portfolioData: normalizedCachedPortfolio,
            holdings: normalizedCachedPortfolio.holdings?.map((h) => h.symbol) || [],
          });
          setOnboardingFlowActiveCookie(false);
          setState("dashboard");
          return;
        }

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
          let portfolioData: PortfolioData | undefined = hasCachedPortfolioData
            ? cachedPortfolioData
            : undefined;

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

          const holdingsCount =
            (Array.isArray(portfolioData?.holdings) && portfolioData?.holdings.length) || 0;

          if (holdingsCount === 0) {
            setFlowData({
              hasFinancialData: false,
              holdingsCount: 0,
              portfolioData: undefined,
              holdings: [],
            });
            if (isDashboardMode) {
              setOnboardingFlowActiveCookie(false);
              setState("dashboard");
            } else {
              setState("import_required");
            }
            return;
          }

          // User has financial data - show dashboard
          setFlowData({
            hasFinancialData: true,
            holdingsCount,
            portfolioData,
            holdings: portfolioData?.holdings?.map(h => h.symbol) || [],
          });
          if (isDashboardMode) {
            // Heal stale onboarding-flow cookies after a successful import/resume.
            setOnboardingFlowActiveCookie(false);
          }
          setState(isDashboardMode ? "dashboard" : "import_required");
        } else {
          // Metadata can temporarily report an empty financial domain during startup/race conditions.
          // If we already have a portfolio cached for this user, trust it instead of bouncing to import.
          if (hasCachedPortfolioData && cachedPortfolioData) {
            const normalizedCachedHoldings = normalizeHoldingsWithPct(
              cachedPortfolioData.holdings
            );
            const normalizedCachedPortfolio: PortfolioData = {
              ...cachedPortfolioData,
              holdings: normalizedCachedHoldings,
            };
            setPortfolioData(userId, normalizedCachedPortfolio);
            setFlowData({
              hasFinancialData: true,
              holdingsCount: normalizedCachedPortfolio.holdings?.length || 0,
              portfolioData: normalizedCachedPortfolio,
              holdings: normalizedCachedPortfolio.holdings?.map((h) => h.symbol) || [],
            });
            if (isDashboardMode) {
              setOnboardingFlowActiveCookie(false);
            }
            setState(isDashboardMode ? "dashboard" : "import_required");
            return;
          }

          // Secondary fallback: metadata can lag while full blob already contains holdings.
          if (vaultKey && effectiveVaultOwnerToken) {
            try {
              const allData = await WorldModelService.loadFullBlob({
                userId,
                vaultKey,
                vaultOwnerToken: effectiveVaultOwnerToken,
              });
              const rawFinancial = allData.financial;
              if (hasValidFinancialDomainData(rawFinancial)) {
                let recoveredPortfolioData = normalizeStoredPortfolio(rawFinancial) as PortfolioData;
                if (recoveredPortfolioData.holdings) {
                  recoveredPortfolioData = {
                    ...recoveredPortfolioData,
                    holdings: normalizeHoldingsWithPct(recoveredPortfolioData.holdings),
                  };
                }
                setPortfolioData(userId, recoveredPortfolioData);
                setFlowData({
                  hasFinancialData: true,
                  holdingsCount: recoveredPortfolioData.holdings?.length || 0,
                  portfolioData: recoveredPortfolioData,
                  holdings: recoveredPortfolioData.holdings?.map((h) => h.symbol) || [],
                });
                if (isDashboardMode) {
                  setOnboardingFlowActiveCookie(false);
                }
                setState(isDashboardMode ? "dashboard" : "import_required");
                return;
              }
            } catch (fallbackError) {
              console.warn(
                "[KaiFlow] Metadata reported no financial domain and full-blob fallback failed:",
                fallbackError
              );
            }
          }

          // No financial data.
          // Ensure stale frontend cache never leaks into first-time user experience.
          invalidateDomain(userId, "financial");
          setFlowData({ hasFinancialData: false });
          if (isDashboardMode) {
            // Stay on dashboard route and show import CTA instead of hard-redirecting.
            // This avoids navigation thrash during transient metadata issues.
            setState("dashboard");
            return;
          }
          setState("import_required");
        }
      } catch (err) {
        console.warn("[KaiFlow] Error checking financial data:", err);
        // Keep dashboard stable on transient failures instead of forcing import redirect.
        if (isDashboardMode) {
          setState("dashboard");
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
    getPortfolioData,
    setPortfolioData,
    invalidateDomain,
    isDashboardMode,
    vaultDialogOpen,
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

  // Keep import stream alive when app/tab is backgrounded; only abort on explicit unload.
  useEffect(() => {
    const abortStream = () => abortControllerRef.current?.abort();
    window.addEventListener('beforeunload', abortStream);

    return () => {
      abortStream();
      window.removeEventListener('beforeunload', abortStream);
    };
  }, []);

  // Handle file upload with SSE streaming
  const handleFileUpload = useCallback(
    async (file: File) => {
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

      if (!vaultKey || !effectiveVaultOwnerToken) {
        setPendingImportFile(file);
        setResumeImportAfterVault(false);
        setVaultDialogOpen(true);
        setError(null);
        toast.info("Create or unlock vault to import portfolio.");
        return;
      }

      const tokenForImport = effectiveVaultOwnerToken;

      try {
        setState("importing");
        setError(null);
        setBusyOperation("portfolio_import_stream", true);
        
        // Reset streaming state
        setStreaming({
          stage: "uploading",
          stageTrail: ["[UPLOADING] Processing uploaded file..."],
          rawStreamLines: ["[UPLOADING] Processing uploaded file..."],
          streamedText: "",
          totalChars: 0,
          chunkCount: 0,
          progressPct: undefined,
          statusMessage: "Processing uploaded file...",
          thoughts: [],
          thoughtCount: 0,
          qualityReport: undefined,
          liveHoldings: [],
          holdingsExtracted: 0,
          holdingsTotal: undefined,
          errorMessage: undefined,
        });

        // Create abort controller for cancellation
        abortControllerRef.current = new AbortController();

        // Build form data
        const formData = new FormData();
        formData.append("file", file);
        formData.append("user_id", userId);

        let response: Response;
        try {
          response = await ApiService.importPortfolioStream({
            formData,
            vaultOwnerToken: tokenForImport,
            signal: abortControllerRef.current.signal,
          });
        } catch (fetchError) {
          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            throw fetchError;
          }
          throw new Error("Network error. Please check your connection and try again.");
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
        let chunkLineBuffer = "";
        let parsedPortfolio: ReviewPortfolioData | null = null;
        let terminalStreamFailureMessage: string | null = null;
        let terminalStreamFailureDetails: string | undefined;
        const validStages = new Set<ImportStage>([
          "idle",
          "uploading",
          "indexing",
          "scanning",
          "thinking",
          "extracting",
          "normalizing",
          "validating",
          "complete",
          "error",
        ]);
        const readNumber = (value: unknown): number | undefined =>
          typeof value === "number" && Number.isFinite(value) ? value : undefined;
        const readString = (value: unknown): string | undefined =>
          typeof value === "string" && value.trim().length > 0 ? value : undefined;
        const readBoolean = (value: unknown): boolean | undefined => {
          if (typeof value === "boolean") return value;
          if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (normalized === "true") return true;
            if (normalized === "false") return false;
          }
          return undefined;
        };
        const readDetails = (value: unknown): string | undefined => {
          if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
          }
          if (value && typeof value === "object") {
            try {
              return JSON.stringify(value);
            } catch {
              return undefined;
            }
          }
          return undefined;
        };
        const formatQualityGateDetails = (value: unknown): string | undefined => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return undefined;
          }
          const gate = value as Record<string, unknown>;
          const reconciled = gate.reconciled_within_cent === true;
          const expected = parseMaybeNumber(gate.expected_total_value);
          const parsed = parseMaybeNumber(gate.holdings_market_value_sum);
          const gap = parseMaybeNumber(gate.reconciliation_gap);
          const holdingsCount = readNumber(gate.holdings_count);
          const placeholderCount = readNumber(gate.placeholder_symbol_count);
          const headerRows = readNumber(gate.account_header_row_count);
          const parts: string[] = [];
          if (typeof holdingsCount === "number") parts.push(`holdings=${holdingsCount}`);
          if (typeof expected === "number") parts.push(`expected=$${expected.toLocaleString()}`);
          if (typeof parsed === "number") parts.push(`parsed=$${parsed.toLocaleString()}`);
          if (typeof gap === "number") parts.push(`gap=$${gap.toLocaleString()}`);
          if (typeof placeholderCount === "number") parts.push(`placeholders=${placeholderCount}`);
          if (typeof headerRows === "number") parts.push(`header_rows=${headerRows}`);
          parts.push(`reconciled=${reconciled ? "yes" : "no"}`);
          return parts.join(" • ");
        };
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
        const normalizeTrailLine = (next: string): string => {
          const line = next.trim().replace(/\s+/g, " ");
          const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
          if (!match) return line;
          const rawTag = match[1] ?? "";
          const rawMessage = match[2] ?? "";
          const tag = rawTag.trim().toUpperCase();
          const message = rawMessage.trim();
          return message ? `[${tag}] ${message}` : `[${tag}]`;
        };
        const trailLineKey = (line: string): string => {
          const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
          if (!match) return line.trim().toLowerCase();
          const rawTag = match[1] ?? "";
          const rawMessage = match[2] ?? "";
          return `[${rawTag.trim().toUpperCase()}] ${rawMessage.trim().toLowerCase()}`;
        };
        const appendTrailLine = (trail: string[], next?: string): string[] => {
          if (!next) return trail;
          const line = normalizeTrailLine(next);
          if (!line) return trail;
          const key = trailLineKey(line);
          if (trail.some((existingLine) => trailLineKey(existingLine) === key)) return trail;
          return [...trail, line];
        };
        const splitChunkTextIntoLines = (
          text: string,
          options?: { flush?: boolean }
        ): string[] => {
          const flush = Boolean(options?.flush);
          if (text) {
            chunkLineBuffer += text;
          }
          if (!chunkLineBuffer) return [];

          const cleaned = chunkLineBuffer
            .replace(/```(?:json)?/gi, " ")
            .replace(/```/g, " ");
          const lines: string[] = [];
          let working = cleaned;

          const safePush = (candidate: string) => {
            const normalized = normalizeRawStreamLine(candidate);
            if (!normalized) return;
            lines.push(normalized);
          };

          const splitLongLine = (line: string): string[] => {
            const result: string[] = [];
            let remaining = line.trim();
            while (remaining.length > 240) {
              const window = remaining.slice(0, 240);
              const breakAt =
                Math.max(
                  window.lastIndexOf(","),
                  window.lastIndexOf("}"),
                  window.lastIndexOf("]"),
                  window.lastIndexOf("{"),
                  window.lastIndexOf(" "),
                ) || 240;
              const idx = breakAt > 80 ? breakAt : 240;
              result.push(remaining.slice(0, idx + 1).trim());
              remaining = remaining.slice(idx + 1).trim();
            }
            if (remaining) result.push(remaining);
            return result;
          };

          // Prefer newline framing for JSON streams; avoid splitting on periods (e.g. "U.S.")
          while (true) {
            const newlineIndex = working.search(/[\n\r]/);
            if (newlineIndex < 0) break;
            const segment = working.slice(0, newlineIndex);
            splitLongLine(segment).forEach(safePush);
            working = working.slice(newlineIndex + 1);
          }

          if (flush) {
            splitLongLine(working).forEach(safePush);
            chunkLineBuffer = "";
            return lines.filter(Boolean);
          }

          // If no newline for a while, emit bounded chunks to keep stream lively.
          while (working.length > 300) {
            const candidate = working.slice(0, 300);
            const lastDelimiter = Math.max(
              candidate.lastIndexOf(","),
              candidate.lastIndexOf("}"),
              candidate.lastIndexOf("]"),
              candidate.lastIndexOf(" "),
            );
            const idx = lastDelimiter > 100 ? lastDelimiter : 300;
            splitLongLine(working.slice(0, idx + 1)).forEach(safePush);
            working = working.slice(idx + 1);
          }

          chunkLineBuffer = working;
          return lines.filter(Boolean);
        };

        await consumeCanonicalKaiStream(
          response,
          (envelope: KaiStreamEnvelope) => {
            const payload = envelope.payload as Record<string, unknown>;

            switch (envelope.event) {
              case "stage": {
                const stageValue = typeof payload.stage === "string" ? payload.stage : undefined;
                const normalizedStageValue =
                  stageValue === "analyzing"
                    ? "scanning"
                    : stageValue === "parsing"
                      ? "normalizing"
                      : stageValue;
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
                  rawStreamLines: appendRawStreamLines(prev.rawStreamLines, [
                    `[STAGE/${stage.toUpperCase()}] ${readString(payload.message) ?? stage}`,
                  ]),
                  stage,
                  totalChars: readNumber(payload.total_chars) ?? prev.totalChars,
                  chunkCount: readNumber(payload.chunk_count) ?? prev.chunkCount,
                  thoughtCount: readNumber(payload.thought_count) ?? prev.thoughtCount,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                  statusMessage: readString(payload.message) ?? prev.statusMessage,
                }));
                break;
              }
              case "thinking": {
                const thought = typeof payload.thought === "string" ? payload.thought : undefined;
                const phase = readString(payload.phase);
                setStreaming((prev) => {
                  const thoughtLine = thought
                    ? `[${(phase || "thinking").toUpperCase()}] ${thought}`
                    : undefined;
                  const thoughts = thoughtLine ? [...prev.thoughts, thoughtLine] : prev.thoughts;
                  if (thought) {
                    fullModelTokenText += `${thoughtLine}\n`;
                  }
                  const thinkingLine = thought
                    ? `[THINKING/${(phase || "GENERAL").toUpperCase()}] ${thought}`
                    : undefined;
                  return {
                    ...prev,
                    stage: "thinking",
                    thoughts,
                    rawStreamLines: appendRawStreamLines(
                      prev.rawStreamLines,
                      thinkingLine ? [thinkingLine] : undefined
                    ),
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
                const chunkLines = splitChunkTextIntoLines(text);
                setStreaming((prev) => ({
                  ...prev,
                  stage: "extracting",
                  rawStreamLines: appendRawStreamLines(prev.rawStreamLines, chunkLines),
                  streamedText: fullModelTokenText || fullStreamedText,
                  totalChars: readNumber(payload.total_chars) ?? fullStreamedText.length,
                  chunkCount: readNumber(payload.chunk_count) ?? prev.chunkCount,
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
                  rawStreamLines: appendRawStreamLines(
                    prev.rawStreamLines,
                    message
                      ? [`[PROGRESS/${(phase || String(prev.stage)).toUpperCase()}] ${message}`]
                      : undefined
                  ),
                  stage:
                    phase === "normalizing" || phase === "validating" || phase === "parsing"
                      ? (phase === "parsing" ? "normalizing" : phase as ImportStage)
                      : prev.stage,
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
                  rawStreamLines: appendRawStreamLines(prev.rawStreamLines, [
                    `[WARNING] ${message}`,
                  ]),
                  statusMessage: message,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                }));
                break;
              }
              case "complete": {
                const rawPortfolioData = payload.portfolio_data_v2 as
                  | Record<string, unknown>
                  | undefined;
                if (
                  !rawPortfolioData ||
                  typeof rawPortfolioData !== "object" ||
                  Array.isArray(rawPortfolioData)
                ) {
                  throw new Error("Missing portfolio_data_v2 in complete event");
                }
                const parseFallback =
                  readBoolean(payload.parse_fallback) ??
                  readBoolean((rawPortfolioData as Record<string, unknown>).parse_fallback) ??
                  false;
                const rawExtractV2 =
                  payload.raw_extract_v2 &&
                  typeof payload.raw_extract_v2 === "object" &&
                  !Array.isArray(payload.raw_extract_v2)
                    ? (payload.raw_extract_v2 as Record<string, unknown>)
                    : undefined;
                const analyticsV2 =
                  payload.analytics_v2 &&
                  typeof payload.analytics_v2 === "object" &&
                  !Array.isArray(payload.analytics_v2)
                    ? (payload.analytics_v2 as Record<string, unknown>)
                    : undefined;
                const qualityReportV2 =
                  payload.quality_report_v2 &&
                  typeof payload.quality_report_v2 === "object" &&
                  !Array.isArray(payload.quality_report_v2)
                    ? (payload.quality_report_v2 as Record<string, unknown>)
                    : undefined;
                parsedPortfolio = normalizePortfolioData({
                  ...(rawPortfolioData as Record<string, unknown>),
                  raw_extract_v2: rawExtractV2,
                  analytics_v2: analyticsV2,
                  quality_report_v2: qualityReportV2,
                  parse_fallback: parseFallback,
                });

                const qualityReportRaw = qualityReportV2;
                const qualityReport =
                  qualityReportRaw &&
                  typeof qualityReportRaw === "object" &&
                  !Array.isArray(qualityReportRaw)
                    ? ({
                        ...(qualityReportRaw as QualityReport),
                      } as QualityReport)
                    : undefined;
                const trailingChunkLines = splitChunkTextIntoLines("", { flush: true }).map(
                  (line) => line
                );
                const completionMessage = readString(payload.message) ?? "Import complete!";

                setStreaming((prev) => ({
                  ...prev,
                  stage: "complete",
                  stageTrail: appendTrailLine(
                    prev.stageTrail,
                    `[COMPLETE] ${completionMessage}`
                  ),
                  rawStreamLines: appendRawStreamLines(prev.rawStreamLines, [
                    ...trailingChunkLines,
                    `[COMPLETE] ${completionMessage}`,
                  ]),
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
                  statusMessage: completionMessage,
                  streamedText: fullModelTokenText || prev.streamedText,
                }));
                break;
              }
              case "aborted": {
                const message =
                  typeof payload.message === "string"
                    ? payload.message
                    : "Import was stopped before completion";
                terminalStreamFailureMessage = message;
                terminalStreamFailureDetails =
                  formatQualityGateDetails(payload.quality_gate) ??
                  readDetails(payload.detail) ??
                  readDetails(payload.diagnostics) ??
                  readString(payload.code);
                setStreaming((prev) => ({
                  ...prev,
                  stage: "error",
                  stageTrail: appendTrailLine(prev.stageTrail, `[ERROR] ${message}`),
                  rawStreamLines: appendRawStreamLines(prev.rawStreamLines, [
                    `[ERROR] ${message}`,
                  ]),
                  errorMessage: message,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                  statusMessage: message,
                }));
                break;
              }
              case "error": {
                const message =
                  typeof payload.message === "string"
                    ? payload.message
                    : "Import failed while parsing the statement";
                terminalStreamFailureMessage = message;
                terminalStreamFailureDetails =
                  formatQualityGateDetails(payload.quality_gate) ??
                  readDetails(payload.detail) ??
                  readDetails(payload.diagnostics) ??
                  readString(payload.code);
                setStreaming((prev) => ({
                  ...prev,
                  stage: "error",
                  stageTrail: appendTrailLine(prev.stageTrail, `[ERROR] ${message}`),
                  rawStreamLines: appendRawStreamLines(prev.rawStreamLines, [
                    `[ERROR] ${message}`,
                  ]),
                  errorMessage: message,
                  progressPct: readNumber(payload.progress_pct) ?? prev.progressPct,
                  statusMessage: message,
                }));
                break;
              }
              default:
                break;
            }
          },
          {
            signal: abortControllerRef.current.signal,
            idleTimeoutMs: KAI_PORTFOLIO_IMPORT_IDLE_TIMEOUT_MS,
            requireTerminal: true,
          }
        );

        if (terminalStreamFailureMessage) {
          setError(terminalStreamFailureMessage);
          toast.error(
            terminalStreamFailureMessage,
            terminalStreamFailureDetails
              ? { description: terminalStreamFailureDetails }
              : undefined
          );
          setState("importing");
          return;
        }

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
        if (parsedPortfolioData.parse_fallback) {
          toast.warning("Portfolio recovered with partial parsing. Review carefully before saving.");
        } else {
          toast.success("Portfolio parsed successfully. Review when ready.");
        }
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
        toast.error(
          err instanceof Error ? err.message : "Failed to import portfolio. Please try again."
        );
        setStreaming((prev) => ({
          ...prev,
          stage: "error",
          stageTrail: (() => {
            const nextLine = `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`;
            return prev.stageTrail.includes(nextLine)
              ? prev.stageTrail
              : [...prev.stageTrail, nextLine];
          })(),
          rawStreamLines: appendRawStreamLines(prev.rawStreamLines, [
            `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`,
          ]),
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          statusMessage: err instanceof Error ? err.message : "Import failed",
        }));
        setState("importing");
      } finally {
        setBusyOperation("portfolio_import_stream", false);
      }
    },
    [userId, vaultKey, effectiveVaultOwnerToken, setBusyOperation]
  );

  useEffect(() => {
    if (!resumeImportAfterVault || !pendingImportFile) return;
    if (!vaultKey || !effectiveVaultOwnerToken) return;
    const queuedFile = pendingImportFile;
    setResumeImportAfterVault(false);
    setPendingImportFile(null);
    void handleFileUpload(queuedFile);
  }, [
    resumeImportAfterVault,
    pendingImportFile,
    vaultKey,
    effectiveVaultOwnerToken,
    handleFileUpload,
  ]);

  useEffect(() => {
    if (vaultDialogOpen || resumeImportAfterVault || resumePreloadAfterVault) return;
    if (!pendingImportFile) return;
    if (vaultKey && effectiveVaultOwnerToken) return;
    setPendingImportFile(null);
  }, [
    vaultDialogOpen,
    resumeImportAfterVault,
    resumePreloadAfterVault,
    pendingImportFile,
    vaultKey,
    effectiveVaultOwnerToken,
  ]);

  useEffect(() => {
    if (vaultDialogOpen || resumeImportAfterVault || resumePreloadAfterVault) return;
    if (!pendingSchemaPreload) return;
    if (vaultKey && effectiveVaultOwnerToken) return;
    setPendingSchemaPreload(false);
  }, [
    vaultDialogOpen,
    resumeImportAfterVault,
    resumePreloadAfterVault,
    pendingSchemaPreload,
    vaultKey,
    effectiveVaultOwnerToken,
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
      rawStreamLines: [],
      streamedText: "",
      totalChars: 0,
      chunkCount: 0,
      progressPct: undefined,
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
      rawStreamLines: [],
      streamedText: "",
      totalChars: 0,
      chunkCount: 0,
      progressPct: undefined,
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
        ending_value: savedData.account_summary.ending_value ?? savedData.total_value ?? 0,
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
      parse_fallback: savedData.parse_fallback,
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
      setOnboardingFlowActiveCookie(false);
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

  const handlePreloadSchema = useCallback(async () => {
    if (isPreloadingSchema) return;

    setIsPreloadingSchema(true);
    setError(null);

    try {
      const template = await fetchDemoModePortfolioTemplate(effectiveVaultOwnerToken);

      setFlowData((previous) => ({
        ...previous,
        parsedPortfolio: template,
      }));
      setState("reviewing");
      setError(null);
      toast.success("Demo mode data loaded. Review and save to vault.");
    } catch (preloadError) {
      console.error("[KaiFlow] Failed to preload schema data:", preloadError);
      toast.error("Could not load demo data. Please retry.");
    } finally {
      setPendingSchemaPreload(false);
      setIsPreloadingSchema(false);
    }
  }, [
    effectiveVaultOwnerToken,
    isPreloadingSchema,
  ]);

  useEffect(() => {
    if (mode !== "import" || state !== "reviewing") return;
    if (flowData.parsedPortfolio) return;

    const timer = window.setTimeout(() => {
      if (stateRef.current !== "reviewing" || flowData.parsedPortfolio) return;
      setError("Could not open review data. Please load demo data again.");
      setState("import_required");
    }, 250);

    return () => window.clearTimeout(timer);
  }, [mode, state, flowData.parsedPortfolio]);

  useEffect(() => {
    if (!resumePreloadAfterVault) return;
    if (!vaultKey || !effectiveVaultOwnerToken) return;
    setResumePreloadAfterVault(false);
    void handlePreloadSchema();
  }, [resumePreloadAfterVault, vaultKey, effectiveVaultOwnerToken, handlePreloadSchema]);

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
        console.log("[KaiFlow] Navigating to /kai/analysis");
        router.push(ROUTES.KAI_ANALYSIS);
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
    <div className="flex w-full flex-col overflow-x-hidden">
      {/* Error display */}
      {error && state !== "importing" && state !== "import_complete" && (
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
      {state === "import_required" && (
        <PortfolioImportView
          onFileSelect={handleFileUpload}
          onSkip={handleSkipImport}
          onPreloadSchema={() => void handlePreloadSchema()}
          isUploading={false}
          isPreloadingSchema={isPreloadingSchema}
        />
      )}

      {state === "importing" && (
        <ImportProgressView
          stage={streaming.stage}
          stageTrail={streaming.stageTrail}
          rawStreamLines={streaming.rawStreamLines}
          isStreaming={
            streaming.stage === "uploading" ||
            streaming.stage === "indexing" ||
            streaming.stage === "scanning" ||
            streaming.stage === "thinking" ||
            streaming.stage === "extracting" ||
            streaming.stage === "normalizing" ||
            streaming.stage === "validating"
          }
          progressPct={streaming.progressPct}
          statusMessage={streaming.statusMessage}
          liveHoldings={streaming.liveHoldings}
          holdingsExtracted={streaming.holdingsExtracted}
          holdingsTotal={streaming.holdingsTotal}
          thoughts={streaming.thoughts}
          thoughtCount={streaming.thoughtCount}
          errorMessage={streaming.errorMessage}
          onCancel={handleCancelImport}
        />
      )}

      {state === "import_complete" && (
        <ImportProgressView
          stage="complete"
          stageTrail={streaming.stageTrail}
          rawStreamLines={streaming.rawStreamLines}
          isStreaming={false}
          progressPct={streaming.progressPct}
          statusMessage={streaming.statusMessage}
          liveHoldings={streaming.liveHoldings}
          holdingsExtracted={streaming.holdingsExtracted}
          holdingsTotal={streaming.holdingsTotal}
          thoughts={streaming.thoughts}
          thoughtCount={streaming.thoughtCount}
          onContinue={handleReviewParsedPortfolio}
          onBackToDashboard={handleBackToDashboardFromImport}
        />
      )}

      {state === "reviewing" && flowData.parsedPortfolio && (
        <PortfolioReviewView
          portfolioData={flowData.parsedPortfolio}
          userId={userId}
          vaultKey={vaultKey ?? undefined}
          vaultOwnerToken={effectiveVaultOwnerToken}
          onSaveComplete={handleSaveComplete}
          onReimport={handleReimport}
          onBack={() => setState("import_required")}
        />
      )}

      {state === "reviewing" && !flowData.parsedPortfolio && (
        <div className="flex min-h-[360px] w-full flex-col items-center justify-center gap-3 px-6 text-center">
          <HushhLoader variant="inline" label="Preparing review..." />
          <p className="text-sm text-muted-foreground">
            Demo data loaded, but review payload is not available yet.
          </p>
          <button
            type="button"
            onClick={() => setState("import_required")}
            className="text-sm font-semibold text-primary underline underline-offset-4"
          >
            Back to import
          </button>
        </div>
      )}

      {isDashboardMode &&
        state === "dashboard" &&
        flowData.portfolioData &&
        Array.isArray(flowData.portfolioData.holdings) &&
        flowData.portfolioData.holdings.length > 0 && (
        <DashboardMasterView
          userId={userId}
          vaultOwnerToken={effectiveVaultOwnerToken ?? ""}
          portfolioData={flowData.portfolioData}
          onAnalyzeStock={handleAnalyzeStock}
          onReupload={handleReimport}
        />
      )}

      {isDashboardMode &&
        state === "dashboard" &&
        (!flowData.portfolioData ||
          !Array.isArray(flowData.portfolioData.holdings) ||
          flowData.portfolioData.holdings.length === 0) && (
        <PortfolioImportView
          onFileSelect={handleFileUpload}
          onSkip={handleSkipImport}
          onPreloadSchema={() => void handlePreloadSchema()}
          isUploading={false}
          isPreloadingSchema={isPreloadingSchema}
        />
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

      {user && (
        <Dialog
          open={vaultDialogOpen}
          onOpenChange={setVaultDialogOpen}
        >
          <DialogContent className="sm:max-w-md p-0 border border-border/60 bg-background shadow-2xl overflow-hidden">
            <DialogTitle className="sr-only">Create or unlock vault to import portfolio</DialogTitle>
            <DialogDescription className="sr-only">
              You need to create or unlock your vault before parsing and importing your statement.
            </DialogDescription>
            <VaultFlow
              user={user}
              enableGeneratedDefault
              onSuccess={() => {
                setVaultDialogOpen(false);
                if (pendingImportFile) {
                  setResumeImportAfterVault(true);
                  return;
                }
                if (pendingSchemaPreload) {
                  setResumePreloadAfterVault(true);
                }
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
