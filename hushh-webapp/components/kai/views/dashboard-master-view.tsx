"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/app-ui/data-table";
import { AssetAllocationDonut } from "@/components/kai/charts/asset-allocation-donut";
import { GainLossDistributionChart } from "@/components/kai/charts/gain-loss-distribution-chart";
import { HoldingsConcentrationChart } from "@/components/kai/charts/holdings-concentration-chart";
import { PortfolioHistoryChart } from "@/components/kai/charts/portfolio-history-chart";
import { SectorAllocationChart } from "@/components/kai/charts/sector-allocation-chart";
import { StatementCashflowChart } from "@/components/kai/charts/statement-cashflow-chart";
import { HoldingRowActions } from "@/components/kai/holdings/holding-row-actions";
import { EditHoldingModal } from "@/components/kai/modals/edit-holding-modal";
import type { Holding as PortfolioHolding, PortfolioData } from "@/components/kai/types/portfolio";
import { ProfileBasedPicksList } from "@/components/kai/cards/profile-based-picks-list";
import { useCache, type PortfolioData as CachedPortfolioData } from "@/lib/cache/cache-context";
import { CacheSyncService } from "@/lib/cache/cache-sync-service";
import { Button as MorphyButton } from "@/lib/morphy-ux/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/lib/morphy-ux/card";
import { Icon } from "@/lib/morphy-ux/ui";
import { KAI_EXPERIENCE_CONTRACT } from "@/lib/kai/experience-contract";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WorldModelService } from "@/lib/services/world-model-service";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/vault/vault-context";
import { mapPortfolioToDashboardViewModel } from "@/components/kai/views/dashboard-data-mapper";
import { getTickerUniverseSnapshot, preloadTickerUniverse } from "@/lib/kai/ticker-universe-cache";

interface DashboardMasterViewProps {
  userId: string;
  vaultOwnerToken: string;
  portfolioData: PortfolioData;
  onAnalyzeStock?: (symbol: string) => void;
  onReupload?: () => void;
}

type ManagedHolding = PortfolioHolding & {
  pending_delete?: boolean;
  client_id: string;
  source_key?: string;
};

interface ComparableHolding {
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  market_value: number;
  cost_basis: number;
  acquisition_date: string;
}

const ALLOCATION_COLOR_PALETTE = [
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

const GENERIC_SECTOR_LABELS = new Set([
  "equity",
  "equities",
  "stock",
  "stocks",
  "fixed income",
  "bond",
  "bonds",
  "cash",
  "cash & cash equivalents",
  "other",
  "unknown",
  "unclassified",
]);

const FINANCIAL_INTENT_MAP = [
  "portfolio",
  "profile",
  "documents",
  "analysis_history",
  "runtime",
  "analysis.decisions",
] as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function compareHoldingsByNameAsc<T extends { name?: string; symbol?: string }>(
  left: T,
  right: T
): number {
  const leftName = String(left.name || "").trim();
  const rightName = String(right.name || "").trim();
  const leftSymbol = String(left.symbol || "").trim();
  const rightSymbol = String(right.symbol || "").trim();
  const leftKey = leftName || leftSymbol;
  const rightKey = rightName || rightSymbol;

  if (!leftKey && !rightKey) return 0;
  if (!leftKey) return 1;
  if (!rightKey) return -1;

  return leftKey.localeCompare(rightKey, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function DataQualityFallback({ title, detail }: { title: string; detail: string }) {
  return (
    <Card variant="none" effect="glass" className="h-full min-w-0 rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-xl border border-dashed border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
          {detail}
        </div>
      </CardContent>
    </Card>
  );
}

function deriveRiskBucket(holdings: ManagedHolding[]): string {
  if (!holdings.length) return "unknown";
  const totalValue = holdings.reduce((sum, holding) => sum + (holding.market_value || 0), 0);
  if (totalValue <= 0) return "unknown";
  const largestHolding = holdings
    .slice()
    .sort((a, b) => (b.market_value || 0) - (a.market_value || 0))[0];
  const largestWeight = largestHolding ? ((largestHolding.market_value || 0) / totalValue) * 100 : 0;
  if (largestWeight >= 30) return "aggressive";
  if (largestWeight >= 15) return "moderate";
  return "conservative";
}

function isHoldingAnalyzeEligible(holding: Partial<PortfolioHolding>): boolean {
  if (typeof holding.analyze_eligible === "boolean") {
    return holding.analyze_eligible;
  }
  if (holding.is_investable !== true) return false;
  if (holding.is_cash_equivalent === true) return false;
  const listing = String(holding.security_listing_status || "")
    .trim()
    .toLowerCase();
  const symbolKind = String(holding.symbol_kind || "")
    .trim()
    .toLowerCase();
  const secCommon =
    holding.is_sec_common_equity_ticker === true ||
    listing === "sec_common_equity" ||
    symbolKind === "us_common_equity_ticker";
  if (!secCommon) return false;
  if (
    listing === "non_sec_common_equity" ||
    listing === "fixed_income" ||
    listing === "cash_or_sweep"
  ) {
    return false;
  }
  return true;
}

function isSpecificSectorLabel(value: string | null | undefined): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  return !GENERIC_SECTOR_LABELS.has(text.toLowerCase());
}

function inferEquityTypeFromName(name: string | null | undefined): string | null {
  const hint = String(name || "").trim().toLowerCase();
  if (!hint) return null;
  if (hint.includes("emerging")) return "Emerging Markets Equity";
  if (hint.includes("eafe") || hint.includes("developed")) return "Developed Markets Equity";
  if (hint.includes("small cp")) return "Small Cap U.S. Equity";
  if (hint.includes("small cap")) return "Small Cap U.S. Equity";
  if (hint.includes("mid cp")) return "Mid Cap U.S. Equity";
  if (hint.includes("mid cap")) return "Mid Cap U.S. Equity";
  if (hint.includes("large cp")) return "Large Cap U.S. Equity";
  if (hint.includes("russell 1000") || hint.includes("large cap")) return "Large Cap U.S. Equity";
  if (hint.includes("growth")) return "Growth Equity";
  if (hint.includes("value")) return "Value Equity";
  return null;
}

function resolveEquitySectorLabel({
  holdingSector,
  tickerSector,
  assetType,
  name,
}: {
  holdingSector?: string | null;
  tickerSector?: string | null;
  assetType?: string | null;
  name?: string | null;
}): string {
  if (isSpecificSectorLabel(holdingSector)) return String(holdingSector).trim();
  if (isSpecificSectorLabel(tickerSector)) return String(tickerSector).trim();
  if (isSpecificSectorLabel(assetType)) return String(assetType).trim();
  const inferred = inferEquityTypeFromName(name);
  if (inferred) return inferred;
  return "Other Equity";
}

function classifyNonEquityBucket({
  isCashEquivalent,
  assetBucket,
  holdingSector,
  tickerSector,
  assetType,
  name,
  symbol,
}: {
  isCashEquivalent?: boolean;
  assetBucket?: string | null;
  holdingSector?: string | null;
  tickerSector?: string | null;
  assetType?: string | null;
  name?: string | null;
  symbol?: string | null;
}): string {
  if (isCashEquivalent || String(assetBucket || "").trim().toLowerCase() === "cash_equivalent") {
    return "Cash & Cash Equivalents";
  }
  const bucket = String(assetBucket || "").trim().toLowerCase();
  const hint = `${holdingSector || ""} ${tickerSector || ""} ${assetType || ""} ${name || ""} ${symbol || ""}`
    .toLowerCase();
  if (bucket === "fixed_income") {
    if (
      hint.includes("tax free")
      || hint.includes("municipal")
      || hint.includes("muni")
      || hint.includes("non-taxable")
      || hint.includes("tax-exempt")
    ) {
      return "Fixed Income Tax-Exempt";
    }
    return "Fixed Income Taxable";
  }
  if (bucket === "real_asset") {
    if (hint.includes("gold") || hint.includes("commodity")) {
      return "Commodities";
    }
    return "Real Assets";
  }
  if (hint.includes("gold") || hint.includes("commodity")) {
    return "Commodities";
  }
  if (hint.includes("real estate") || hint.includes("reit")) {
    return "Real Assets";
  }
  return "Other";
}

function toComparableHolding(holding: Partial<PortfolioHolding>): ComparableHolding {
  return {
    symbol: String(holding.symbol || "").trim().toUpperCase(),
    name: String(holding.name || "").trim(),
    quantity: Number.isFinite(Number(holding.quantity)) ? Number(holding.quantity) : 0,
    price: Number.isFinite(Number(holding.price)) ? Number(holding.price) : 0,
    market_value: Number.isFinite(Number(holding.market_value)) ? Number(holding.market_value) : 0,
    cost_basis: Number.isFinite(Number(holding.cost_basis)) ? Number(holding.cost_basis) : 0,
    acquisition_date: String(holding.acquisition_date || "").trim(),
  };
}

function comparableHoldingsEqual(a: ComparableHolding, b: ComparableHolding): boolean {
  return (
    a.symbol === b.symbol &&
    a.name === b.name &&
    Math.abs(a.quantity - b.quantity) < 0.0001 &&
    Math.abs(a.price - b.price) < 0.0001 &&
    Math.abs(a.market_value - b.market_value) < 0.01 &&
    Math.abs(a.cost_basis - b.cost_basis) < 0.01 &&
    a.acquisition_date === b.acquisition_date
  );
}

function createLocalHoldingId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildManagedHoldingsFromSource(sourceHoldings: PortfolioHolding[]): {
  managed: ManagedHolding[];
  baselineBySource: Map<string, ComparableHolding>;
} {
  const baselineBySource = new Map<string, ComparableHolding>();
  const managed = sourceHoldings.map((holding, index) => {
    const sourceKey = `source-${index}`;
    baselineBySource.set(sourceKey, toComparableHolding(holding));
    return {
      ...holding,
      pending_delete: false,
      client_id: sourceKey,
      source_key: sourceKey,
    };
  });
  return { managed, baselineBySource };
}

export function DashboardMasterView({
  userId,
  vaultOwnerToken,
  portfolioData,
  onAnalyzeStock,
  onReupload,
}: DashboardMasterViewProps) {
  const { vaultKey } = useVault();
  const { setPortfolioData: setCachePortfolioData } = useCache();
  const baselineBySourceRef = useRef<Map<string, ComparableHolding>>(new Map());

  const [holdingsDraft, setHoldingsDraft] = useState<ManagedHolding[]>([]);
  const [tickerSectorLookup, setTickerSectorLookup] = useState<
    Map<string, { sector?: string; industry?: string }>
  >(() => {
    const rows = getTickerUniverseSnapshot() || [];
    const map = new Map<string, { sector?: string; industry?: string }>();
    for (const row of rows) {
      const ticker = String(row.ticker || "").trim().toUpperCase();
      if (!ticker) continue;
      const sector = String(row.sector || row.sector_primary || "").trim() || undefined;
      const industry = String(row.industry || row.industry_primary || "").trim() || undefined;
      if (!sector && !industry) continue;
      map.set(ticker, { sector, industry });
    }
    return map;
  });
  const [isSavingHoldings, setIsSavingHoldings] = useState(false);
  const [isDeletingImportedData, setIsDeletingImportedData] = useState(false);
  const [deleteImportedDialogOpen, setDeleteImportedDialogOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<ManagedHolding | null>(null);
  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mobileHoldingsTab, _setMobileHoldingsTab] = useState<
    "all" | "analyze" | "non-analyze" | "cash"
  >("all");

  useEffect(() => {
    const sourceHoldings = (portfolioData.holdings || []) as PortfolioHolding[];
    const { managed, baselineBySource } = buildManagedHoldingsFromSource(sourceHoldings);
    baselineBySourceRef.current = baselineBySource;
    setHoldingsDraft(managed);
  }, [portfolioData]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await preloadTickerUniverse();
        if (cancelled) return;
        const map = new Map<string, { sector?: string; industry?: string }>();
        for (const row of rows) {
          const ticker = String(row.ticker || "").trim().toUpperCase();
          if (!ticker) continue;
          const sector = String(row.sector || row.sector_primary || "").trim() || undefined;
          const industry = String(row.industry || row.industry_primary || "").trim() || undefined;
          if (!sector && !industry) continue;
          map.set(ticker, { sector, industry });
        }
        setTickerSectorLookup(map);
      } catch {
        // Keep statement payload values when ticker metadata is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeHoldings = useMemo(
    () =>
      holdingsDraft
        .filter((holding) => !holding.pending_delete)
        .map((holding) => {
          const {
            pending_delete: _pendingDelete,
            client_id: _clientId,
            source_key: _sourceKey,
            ...rest
          } = holding;
          return rest;
        }),
    [holdingsDraft]
  );

  const holdingsChangeSummary = useMemo(() => {
    const baselineBySource = baselineBySourceRef.current;
    let added = 0;
    let edited = 0;
    let deleted = 0;

    for (const holding of holdingsDraft) {
      const baseline = holding.source_key ? baselineBySource.get(holding.source_key) : undefined;

      if (!baseline) {
        if (!holding.pending_delete) {
          added += 1;
        }
        continue;
      }

      if (holding.pending_delete) {
        deleted += 1;
        continue;
      }

      const currentComparable = toComparableHolding(holding);
      if (!comparableHoldingsEqual(currentComparable, baseline)) {
        edited += 1;
      }
    }

    return {
      added,
      edited,
      deleted,
      total: added + edited + deleted,
    };
  }, [holdingsDraft]);

  const hasHoldingsChanges = holdingsChangeSummary.total > 0;

  const workingPortfolioData = useMemo<PortfolioData>(
    () => {
      if (!hasHoldingsChanges) {
        return {
          ...portfolioData,
          holdings: activeHoldings,
        };
      }

      const cashBalance = Number(
        portfolioData.account_summary?.cash_balance ?? portfolioData.cash_balance ?? 0
      );
      const holdingsTotalValue = activeHoldings.reduce(
        (sum, holding) => sum + Number(holding.market_value || 0),
        0
      );
      const holdingsIncludeCash = activeHoldings.some(
        (holding) => holding.is_cash_equivalent === true
      );
      const endingValue = holdingsTotalValue + (holdingsIncludeCash ? 0 : cashBalance);
      const beginningValueRaw = Number(portfolioData.account_summary?.beginning_value);
      const beginningValue = Number.isFinite(beginningValueRaw) ? beginningValueRaw : endingValue;

      return {
        ...portfolioData,
        holdings: activeHoldings,
        total_value: endingValue,
        cash_balance: cashBalance,
        account_summary: {
          ...portfolioData.account_summary,
          ending_value: endingValue,
          cash_balance: cashBalance,
          equities_value: activeHoldings
            .filter((holding) => holding.is_cash_equivalent !== true)
            .reduce((sum, holding) => sum + Number(holding.market_value || 0), 0),
          change_in_value: endingValue - beginningValue,
        },
        ...(hasHoldingsChanges ? { analytics_v2: undefined } : {}),
      };
    },
    [activeHoldings, hasHoldingsChanges, portfolioData]
  );

  const model = useMemo(
    () => mapPortfolioToDashboardViewModel(workingPortfolioData),
    [workingPortfolioData]
  );

  const allocationData = useMemo(
    () =>
      model.allocation.map((entry, index) => ({
        ...entry,
        color: ALLOCATION_COLOR_PALETTE[index % ALLOCATION_COLOR_PALETTE.length] ?? "#2563eb",
      })),
    [model.allocation]
  );

  const holdingSymbols = useMemo(
    () => model.canonicalModel.debateContext.eligibleSymbols.slice(0, 20),
    [model.canonicalModel.debateContext.eligibleSymbols]
  );

  const sortedHoldingsDraft = useMemo(
    () => [...holdingsDraft].sort(compareHoldingsByNameAsc),
    [holdingsDraft]
  );

  const desktopHoldingTables = useMemo(
    () => ({
      all: sortedHoldingsDraft,
      analyzeEligible: sortedHoldingsDraft.filter((holding) => isHoldingAnalyzeEligible(holding)),
      nonAnalyzable: sortedHoldingsDraft.filter(
        (holding) => !holding.is_cash_equivalent && !isHoldingAnalyzeEligible(holding)
      ),
      cashSweep: sortedHoldingsDraft.filter((holding) => holding.is_cash_equivalent === true),
    }),
    [sortedHoldingsDraft]
  );
  const _mobileHoldingsData = useMemo(() => {
    if (mobileHoldingsTab === "analyze") return desktopHoldingTables.analyzeEligible;
    if (mobileHoldingsTab === "non-analyze") return desktopHoldingTables.nonAnalyzable;
    if (mobileHoldingsTab === "cash") return desktopHoldingTables.cashSweep;
    return desktopHoldingTables.all;
  }, [desktopHoldingTables, mobileHoldingsTab]);
  const holdingsBifurcation = useMemo(() => {
    let cashSweep = 0;
    let analyzeEligible = 0;
    let nonAnalyzable = 0;
    for (const holding of holdingsDraft) {
      if (holding.pending_delete) continue;
      if (holding.is_cash_equivalent === true) {
        cashSweep += 1;
        continue;
      }
      if (isHoldingAnalyzeEligible(holding)) {
        analyzeEligible += 1;
      } else {
        nonAnalyzable += 1;
      }
    }
    return { cashSweep, analyzeEligible, nonAnalyzable };
  }, [holdingsDraft]);

  const investorSnapshot = useMemo(() => {
    const totalValue = model.hero.totalValue || 0;
    const holdings = model.canonicalModel.positions.filter((position) => position.debateEligible);
    const losers = holdings.filter((holding) => (holding.gainLoss || 0) < 0);
    const losersValue = losers.reduce((sum, holding) => sum + (holding.marketValue || 0), 0);
    const winnersCount = holdings.filter((holding) => (holding.gainLoss || 0) > 0).length;
    const uniqueSectors = new Set(
      holdings
        .map((holding) => String(holding.sector || holding.assetType || "").trim())
        .filter((value) => value.length > 0)
    ).size;
    const top3ConcentrationPct =
      totalValue > 0
        ? model.concentration
            .slice(0, 3)
            .reduce((sum, row) => sum + row.weightPct, 0)
        : 0;
    const cashRow = model.allocation.find((row) => row.name.toLowerCase().includes("cash"));
    const fixedIncomeRow = model.allocation.find(
      (row) =>
        row.name.toLowerCase().includes("fixed income") ||
        row.name.toLowerCase().includes("bond")
    );
    const realAssetsRow = model.allocation.find(
      (row) =>
        row.name.toLowerCase().includes("real asset") ||
        row.name.toLowerCase().includes("real estate") ||
        row.name.toLowerCase().includes("commod")
    );
    const estimatedAnnualIncome = holdings.reduce(
      (sum, holding) => sum + (holding.estimatedAnnualIncome || 0),
      0
    );
    const annualYieldPct =
      totalValue > 0 && estimatedAnnualIncome > 0
        ? (estimatedAnnualIncome / totalValue) * 100
        : 0;
    const optimizationPressurePct = totalValue > 0 ? (losersValue / totalValue) * 100 : 0;
    const readinessScore = Math.round(
      ((model.quality.sectorCoveragePct +
        model.quality.gainLossCoveragePct +
        (model.quality.allocationReady ? 1 : 0) +
        (model.quality.concentrationReady ? 1 : 0)) /
        4) *
        100
    );

    return {
      losersCount: losers.length,
      winnersCount,
      uniqueSectors,
      top3ConcentrationPct,
      cashPct: totalValue > 0 && cashRow ? (cashRow.value / totalValue) * 100 : 0,
      fixedIncomePct: totalValue > 0 && fixedIncomeRow ? (fixedIncomeRow.value / totalValue) * 100 : 0,
      realAssetsPct: totalValue > 0 && realAssetsRow ? (realAssetsRow.value / totalValue) * 100 : 0,
      estimatedAnnualIncome,
      annualYieldPct,
      optimizationPressurePct,
      readinessScore,
    };
  }, [model]);

  const equitySectorChartHoldings = useMemo(
    () =>
      model.canonicalModel.positions
        .filter((position) => !position.isCashEquivalent && position.assetBucket === "equity")
        .map((position) => {
          const enriched = tickerSectorLookup.get(
            String(position.displaySymbol || "").trim().toUpperCase()
          );
          return {
            symbol: position.displaySymbol,
            name: position.name,
            market_value: position.marketValue,
            sector: resolveEquitySectorLabel({
              holdingSector: position.sector,
              tickerSector: enriched?.sector,
              assetType: position.assetType,
              name: position.name,
            }),
            asset_type: position.assetType || undefined,
          };
        }),
    [model.canonicalModel.positions, tickerSectorLookup]
  );

  const nonEquityAllocationChartHoldings = useMemo(
    () =>
      model.canonicalModel.positions
        .filter((position) => position.isCashEquivalent || position.assetBucket !== "equity")
        .map((position) => {
          const enriched = tickerSectorLookup.get(
            String(position.displaySymbol || "").trim().toUpperCase()
          );
          return {
            symbol: position.displaySymbol,
            name: position.name,
            market_value: position.marketValue,
            sector: classifyNonEquityBucket({
              isCashEquivalent: position.isCashEquivalent,
              assetBucket: position.assetBucket,
              holdingSector: position.sector,
              tickerSector: enriched?.sector,
              assetType: position.assetType,
              name: position.name,
              symbol: position.displaySymbol,
            }),
            asset_type: position.assetType || undefined,
          };
        }),
    [model.canonicalModel.positions, tickerSectorLookup]
  );

  const equitySectorCoveragePct = useMemo(() => {
    const equityPositions = model.canonicalModel.positions.filter(
      (position) => !position.isCashEquivalent && position.assetBucket === "equity"
    );
    if (equityPositions.length === 0) return 1;
    const covered = equityPositions.filter((position) => {
      const enriched = tickerSectorLookup.get(
        String(position.displaySymbol || "").trim().toUpperCase()
      );
      return (
        isSpecificSectorLabel(position.sector)
        || isSpecificSectorLabel(enriched?.sector)
        || isSpecificSectorLabel(position.assetType)
        || Boolean(inferEquityTypeFromName(position.name))
      );
    }).length;
    return covered / equityPositions.length;
  }, [model.canonicalModel.positions, tickerSectorLookup]);

  const nonEquityCoveragePct = useMemo(() => {
    const nonEquityPositions = model.canonicalModel.positions.filter(
      (position) => position.isCashEquivalent || position.assetBucket !== "equity"
    );
    if (nonEquityPositions.length === 0) return 1;
    return 1;
  }, [model.canonicalModel.positions]);

  const hasEquitySectorAllocation = equitySectorChartHoldings.length > 0;
  const hasNonEquityAllocation = nonEquityAllocationChartHoldings.length > 0;

  const statementSnapshotRows = useMemo(() => {
    const metrics = model.summaryMetrics;
    return [
      {
        key: "investment-results",
        label: "Investment Results",
        value: metrics.investmentGainLoss,
      },
      {
        key: "income-period",
        label: "Income (Period)",
        value: metrics.totalIncomePeriod,
      },
      {
        key: "income-ytd",
        label: "Income (YTD)",
        value: metrics.totalIncomeYtd,
      },
      {
        key: "fees",
        label: "Fees",
        value: metrics.totalFees,
      },
      {
        key: "net-deposits-period",
        label: "Net Deposits (Period)",
        value: metrics.netDepositsPeriod,
      },
      {
        key: "net-deposits-ytd",
        label: "Net Deposits (YTD)",
        value: metrics.netDepositsYtd,
      },
    ].filter((row) => typeof row.value === "number");
  }, [model.summaryMetrics]);

  const statementChartData = useMemo(
    () =>
      statementSnapshotRows.map((row) => ({
        key: row.key,
        label: row.label.replace(" (Period)", "").replace(" (YTD)", " YTD"),
        value: Number(row.value || 0),
        tone:
          row.key === "fees"
            ? ("negative" as const)
            : row.key === "investment-results" && Number(row.value || 0) < 0
              ? ("negative" as const)
              : row.key.includes("income") || row.key === "investment-results"
                ? ("positive" as const)
                : ("neutral" as const),
      })),
    [statementSnapshotRows]
  );

  const closeHoldingModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingHolding(null);
    setEditingHoldingId(null);
  }, []);

  const openAddHoldingModal = useCallback(() => {
    setEditingHolding({
      symbol: "",
      name: "",
      quantity: 0,
      price: 0,
      market_value: 0,
      pending_delete: false,
      client_id: createLocalHoldingId(),
    });
    setEditingHoldingId(null);
    setIsModalOpen(true);
  }, []);

  const persistHoldingsChanges = useCallback(async () => {
    if (!userId || !vaultKey) {
      toast.error("Unlock your Vault to save holdings.");
      return;
    }

    const invalidHolding = activeHoldings.find((holding) => {
      const quantity = Number(holding.quantity);
      const price = Number(holding.price);
      const marketValue = Number(holding.market_value);
      return (
        !Number.isFinite(quantity) ||
        !Number.isFinite(price) ||
        !Number.isFinite(marketValue) ||
        quantity <= 0 ||
        price <= 0 ||
        marketValue <= 0
      );
    });
    if (invalidHolding) {
      toast.error(
        `Holding ${invalidHolding.symbol || invalidHolding.name || "entry"} has invalid values. Quantity, price, and market value must be greater than 0.`
      );
      return;
    }

    setIsSavingHoldings(true);
    try {
      const holdingsForSave = activeHoldings;
      const cashBalance = Number(
        portfolioData.account_summary?.cash_balance ?? portfolioData.cash_balance ?? 0
      );
      const holdingsTotalValue = holdingsForSave.reduce(
        (sum, holding) => sum + Number(holding.market_value || 0),
        0
      );
      const holdingsIncludeCash = holdingsForSave.some(
        (holding) => holding.is_cash_equivalent === true
      );
      const endingValue = holdingsTotalValue + (holdingsIncludeCash ? 0 : cashBalance);
      const beginningValueRaw = Number(portfolioData.account_summary?.beginning_value);
      const beginningValue = Number.isFinite(beginningValueRaw) ? beginningValueRaw : endingValue;
      const equitiesValue = holdingsForSave
        .filter((holding) => holding.is_cash_equivalent !== true)
        .reduce((sum, holding) => sum + Number(holding.market_value || 0), 0);

      const updatedPortfolioData: PortfolioData = {
        ...portfolioData,
        holdings: holdingsForSave,
        account_summary: {
          ...portfolioData.account_summary,
          ending_value: endingValue,
          equities_value: equitiesValue,
          cash_balance: cashBalance,
          change_in_value: endingValue - beginningValue,
        },
        total_value: endingValue,
        cash_balance: cashBalance,
      };

      const nowIso = new Date().toISOString();
      const fullBlob = await WorldModelService.loadFullBlob({
        userId,
        vaultKey,
        vaultOwnerToken: vaultOwnerToken || undefined,
      }).catch(() => ({} as Record<string, unknown>));

      const existingFinancialRaw = fullBlob.financial;
      const existingFinancial =
        existingFinancialRaw &&
        typeof existingFinancialRaw === "object" &&
        !Array.isArray(existingFinancialRaw)
          ? ({ ...(existingFinancialRaw as Record<string, unknown>) } as Record<string, unknown>)
          : {};

      const nextFinancialDomain = {
        ...existingFinancial,
        schema_version: 3,
        domain_intent: {
          primary: "financial",
          source: "domain_registry_prepopulate",
          contract_version: 2,
          updated_at: nowIso,
        },
        portfolio: {
          ...updatedPortfolioData,
          domain_intent: {
            primary: "financial",
            secondary: "portfolio",
            source: "kai_dashboard_holdings",
            captured_sections: ["account_info", "account_summary", "holdings", "transactions"],
            updated_at: nowIso,
          },
        },
        updated_at: nowIso,
      };

      const riskBucket = deriveRiskBucket(holdingsForSave as ManagedHolding[]);
      const result = await WorldModelService.storeMergedDomain({
        userId,
        vaultKey,
        domain: "financial",
        domainData: nextFinancialDomain as unknown as Record<string, unknown>,
        summary: {
          intent_source: "kai_dashboard_holdings",
          has_portfolio: true,
          holdings_count: holdingsForSave.length,
          last_statement_total_value: endingValue,
          portfolio_risk_bucket: riskBucket,
          risk_bucket: riskBucket,
          domain_contract_version: 2,
          intent_map: [...FINANCIAL_INTENT_MAP],
          last_updated: nowIso,
        },
        vaultOwnerToken: vaultOwnerToken || undefined,
      });

      if (!result.success) {
        throw new Error("Failed to save holdings");
      }

      setCachePortfolioData(userId, updatedPortfolioData as CachedPortfolioData);
      CacheSyncService.onPortfolioUpserted(userId, updatedPortfolioData as CachedPortfolioData);
      const { managed, baselineBySource } = buildManagedHoldingsFromSource(holdingsForSave);
      baselineBySourceRef.current = baselineBySource;
      setHoldingsDraft(managed);
      toast.success("Holdings updated");
    } catch (error) {
      console.error("[DashboardMasterView] Failed to save holdings:", error);
      toast.error("We could not save your holdings. Please try again.");
    } finally {
      setIsSavingHoldings(false);
    }
  }, [activeHoldings, portfolioData, setCachePortfolioData, userId, vaultKey, vaultOwnerToken]);

  const handleDeleteImportedData = useCallback(async () => {
    if (!userId || !vaultKey) {
      toast.error("Unlock your Vault to delete imported data.");
      return;
    }

    setIsDeletingImportedData(true);
    try {
      const nowIso = new Date().toISOString();
      const baseFullBlob = await WorldModelService.loadFullBlob({
        userId,
        vaultKey,
        vaultOwnerToken: vaultOwnerToken || undefined,
      }).catch(() => ({} as Record<string, unknown>));

      const existingFinancialRaw = baseFullBlob.financial;
      const existingFinancial =
        existingFinancialRaw &&
        typeof existingFinancialRaw === "object" &&
        !Array.isArray(existingFinancialRaw)
          ? ({ ...(existingFinancialRaw as Record<string, unknown>) } as Record<string, unknown>)
          : {};

      const existingDocumentsRaw = existingFinancial.documents;
      const existingDocuments =
        existingDocumentsRaw &&
        typeof existingDocumentsRaw === "object" &&
        !Array.isArray(existingDocumentsRaw)
          ? ({ ...(existingDocumentsRaw as Record<string, unknown>) } as Record<string, unknown>)
          : {};

      const clearedPortfolioData: PortfolioData = {
        account_info: portfolioData.account_info,
        account_summary: {
          beginning_value: 0,
          ending_value: 0,
          change_in_value: 0,
          cash_balance: 0,
          equities_value: 0,
        },
        holdings: [],
        transactions: [],
        asset_allocation: {
          cash_percent: 0,
          equities_percent: 0,
          bonds_percent: 0,
          other_percent: 0,
          cash_value: 0,
          equities_value: 0,
          bonds_value: 0,
          other_value: 0,
        },
        income_summary: {
          dividends_taxable: 0,
          interest_income: 0,
          total_income: 0,
        },
        realized_gain_loss: {
          short_term_gain: 0,
          long_term_gain: 0,
          net_realized: 0,
        },
        cash_balance: 0,
        total_value: 0,
      };

      const nextFinancialDomain = {
        ...existingFinancial,
        schema_version: 3,
        domain_intent: {
          primary: "financial",
          source: "domain_registry_prepopulate",
          contract_version: 2,
          updated_at: nowIso,
        },
        portfolio: {
          ...clearedPortfolioData,
          domain_intent: {
            primary: "financial",
            secondary: "portfolio",
            source: "kai_dashboard_delete_import",
            captured_sections: ["account_info", "account_summary", "holdings", "documents"],
            updated_at: nowIso,
          },
        },
        documents: {
          ...existingDocuments,
          schema_version: 1,
          statements: [],
          documents_count: 0,
          last_statement_end: null,
          last_brokerage: null,
          parse_fallback_last_import: null,
          sparse_sections_last_import: [],
          last_updated: nowIso,
          domain_intent: {
            primary: "financial",
            secondary: "documents",
            source: "kai_dashboard_delete_import",
            updated_at: nowIso,
          },
        },
        updated_at: nowIso,
      };

      const result = await WorldModelService.storeMergedDomainWithPreparedBlob({
        userId,
        vaultKey,
        domain: "financial",
        domainData: nextFinancialDomain as Record<string, unknown>,
        summary: {
          intent_source: "kai_dashboard_delete_import",
          has_portfolio: false,
          holdings_count: 0,
          attribute_count: 0,
          item_count: 0,
          investable_positions_count: 0,
          cash_positions_count: 0,
          allocation_coverage_pct: 0,
          parser_quality_score: 0,
          last_statement_total_value: 0,
          documents_count: 0,
          last_statement_end: null,
          last_brokerage: null,
          parse_fallback_last_import: null,
          sparse_sections_last_import: [],
          domain_contract_version: 2,
          intent_map: [...FINANCIAL_INTENT_MAP],
          last_updated: nowIso,
        },
        baseFullBlob,
        vaultOwnerToken: vaultOwnerToken || undefined,
      });

      if (!result.success) {
        throw new Error("Failed to delete imported data");
      }

      CacheSyncService.onWorldModelDomainCleared(userId, "financial");
      baselineBySourceRef.current = new Map();
      setHoldingsDraft([]);
      setDeleteImportedDialogOpen(false);
      toast.success("Imported portfolio data deleted.");

      if (typeof onReupload === "function") {
        onReupload();
      }
    } catch (error) {
      console.error("[DashboardMasterView] Failed to delete imported data:", error);
      toast.error("We could not delete imported data. Please try again.");
    } finally {
      setIsDeletingImportedData(false);
    }
  }, [onReupload, portfolioData.account_info, userId, vaultKey, vaultOwnerToken]);

  const handleEditHolding = useCallback(
    (holdingId: string) => {
      const row = holdingsDraft.find((holding) => holding.client_id === holdingId);
      if (!row) return;
      if (row.pending_delete) {
        toast.info("Restore this holding before editing.");
        return;
      }
      setEditingHolding({ ...row, pending_delete: false });
      setEditingHoldingId(holdingId);
      setIsModalOpen(true);
    },
    [holdingsDraft]
  );

  const handleSaveHolding = useCallback(
    (updatedHolding: PortfolioHolding) => {
      const quantity = Number(updatedHolding.quantity);
      const price = Number(updatedHolding.price);
      const marketValue = Number(updatedHolding.market_value);

      if (
        !Number.isFinite(quantity) ||
        !Number.isFinite(price) ||
        !Number.isFinite(marketValue) ||
        quantity <= 0 ||
        price <= 0 ||
        marketValue <= 0
      ) {
        toast.error("Quantity, price, and market value must all be greater than 0.");
        return;
      }

      const normalizedHolding: PortfolioHolding = {
        ...updatedHolding,
        quantity,
        price,
        market_value: marketValue,
      };

      setHoldingsDraft((prev) => {
        const next = [...prev];
        const targetIndex = editingHoldingId
          ? next.findIndex((holding) => holding.client_id === editingHoldingId)
          : -1;

        if (targetIndex >= 0) {
          const existing = next[targetIndex];
          if (!existing) return next;
          next[targetIndex] = {
            ...existing,
            ...normalizedHolding,
            pending_delete: false,
            client_id: existing.client_id,
            source_key: existing.source_key,
          };
        } else {
          next.push({
            ...normalizedHolding,
            pending_delete: false,
            client_id: createLocalHoldingId(),
          });
        }
        return next;
      });
      closeHoldingModal();
    },
    [closeHoldingModal, editingHoldingId]
  );

  const handleToggleDeleteHolding = useCallback((holdingId: string) => {
    setHoldingsDraft((prev) =>
      prev.map((holding) =>
        holding.client_id === holdingId
          ? { ...holding, pending_delete: !holding.pending_delete }
          : holding
      )
    );
  }, []);

  const holdingsTableColumns = useMemo<ColumnDef<ManagedHolding>[]>(
    () => [
      {
        id: "row_actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const holding = row.original;
          const deleted = Boolean(holding.pending_delete);
          return (
            <div className="flex items-start justify-center pt-1">
              <HoldingRowActions
                symbol={holding.symbol}
                isDeleted={deleted}
                disableEdit={deleted}
                layout="row"
                className="w-auto"
                onEdit={() => handleEditHolding(holding.client_id)}
                onToggleDelete={() => handleToggleDeleteHolding(holding.client_id)}
              />
            </div>
          );
        },
      },
      {
        accessorKey: "symbol",
        header: "Holding",
        cell: ({ row }) => {
          const holding = row.original;
          const deleted = Boolean(holding.pending_delete);
          return (
            <div
              className={cn(
                "min-w-[170px] max-w-[240px] sm:max-w-[280px] lg:max-w-[340px]",
                deleted && "opacity-60"
              )}
            >
              <p className={cn("font-semibold", deleted && "line-through")}>
                {holding.symbol || "—"}
              </p>
              <p
                title={holding.name || "Unnamed security"}
                className={cn("truncate text-xs text-muted-foreground", deleted && "line-through")}
              >
                {holding.name || "Unnamed security"}
              </p>
            </div>
          );
        },
      },
      {
        id: "position",
        header: "Shares @ Price",
        cell: ({ row }) => {
          const holding = row.original;
          return (
            <span
              className={cn(
                "text-xs sm:text-sm leading-tight",
                holding.pending_delete && "line-through text-muted-foreground"
              )}
            >
              {Number(holding.quantity || 0).toLocaleString()} @ {formatCurrency(Number(holding.price || 0))}
            </span>
          );
        },
      },
      {
        accessorKey: "market_value",
        header: "Market Value",
        cell: ({ row }) => {
          const holding = row.original;
          return (
            <span
              className={cn(
                "font-semibold text-xs sm:text-sm leading-tight",
                holding.pending_delete && "line-through text-muted-foreground"
              )}
            >
              {formatCurrency(Number(holding.market_value || 0))}
            </span>
          );
        },
      },
      {
        accessorKey: "unrealized_gain_loss",
        header: "Gain / Loss",
        cell: ({ row }) => {
          const holding = row.original;
          const gain = Number(holding.unrealized_gain_loss || 0);
          const gainText = `${gain >= 0 ? "+" : ""}${formatCurrency(gain)}`;
          return (
            <span
              className={cn(
                "font-medium",
                holding.pending_delete
                  ? "line-through text-muted-foreground"
                  : gain >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
              )}
            >
              {gainText}
            </span>
          );
        },
      },
    ],
    [handleEditHolding, handleToggleDeleteHolding]
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 overflow-x-hidden px-5 pb-6 pt-[var(--kai-view-top-gap,16px)] sm:px-8">
      <Card
        variant="muted"
        effect="fill"
        className="overflow-hidden rounded-[26px] p-0 !border-transparent shadow-[0_14px_44px_rgba(15,23,42,0.06)]"
      >
        <CardContent className="space-y-6 p-6 sm:p-7">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm font-medium text-muted-foreground">Total portfolio value</p>
            <div className="flex flex-wrap justify-center gap-2">
              <span className="inline-flex items-center rounded-full bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Risk: {model.hero.portfolioConcentrationLabel.replace(" Concentration", "")}
              </span>
              <span className="inline-flex items-center rounded-full bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Holdings: {model.hero.investableHoldingsCount}
              </span>
              {model.hero.cashPositionsCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Cash Positions: {model.hero.cashPositionsCount}
                </span>
              ) : null}
            </div>
            <p className="text-4xl font-black tracking-tight">{formatCurrency(model.hero.totalValue)}</p>
            <div className="flex items-center justify-center gap-2 text-sm">
              <span
                className={cn(
                  "inline-flex items-center font-semibold",
                  model.hero.netChange >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                )}
              >
                <Icon icon={model.hero.netChange >= 0 ? TrendingUp : TrendingDown} size="sm" className="mr-1" />
                {model.hero.netChange >= 0 ? "+" : ""}
                {formatCurrency(model.hero.netChange)} ({model.hero.changePct.toFixed(2)}%)
              </span>
              {model.hero.statementPeriod ? (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{model.hero.statementPeriod}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/75 p-4 text-center">
            <p className="text-sm font-semibold">{model.hero.statementPeriod || "Current statement period"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Beginning Balance:{" "}
              <span className="font-semibold text-foreground">{formatCurrency(model.hero.beginningValue)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        {hasEquitySectorAllocation ? (
          <SectorAllocationChart
            className="min-w-0 overflow-hidden rounded-[22px]"
            holdings={equitySectorChartHoldings}
            title="Equity Sector Allocation"
            subtitle={`${(equitySectorCoveragePct * 100).toFixed(0)}% of equity holdings have mapped sector labels. Denominator: ${formatCurrency(model.hero.totalValue)} total portfolio value.`}
          />
        ) : (
          <DataQualityFallback
            title="Equity Sector Allocation"
            detail="No equity holdings are currently available for sector-level allocation."
          />
        )}

        {hasNonEquityAllocation ? (
          <SectorAllocationChart
            className="min-w-0 overflow-hidden rounded-[22px]"
            holdings={nonEquityAllocationChartHoldings}
            title="Non-Equity Allocation"
            subtitle={`${(nonEquityCoveragePct * 100).toFixed(0)}% of non-equity holdings are mapped to canonical allocation buckets. Denominator: ${formatCurrency(model.hero.totalValue)} total portfolio value.`}
          />
        ) : (
          <DataQualityFallback
            title="Non-Equity Allocation"
            detail="No non-equity holdings are present in the current portfolio."
          />
        )}
      </section>

      {statementSnapshotRows.length > 0 ? (
        <StatementCashflowChart data={statementChartData} />
      ) : null}

      <Card
        variant="muted"
        effect="fill"
        className="rounded-[24px] p-0 !border-transparent shadow-[0_12px_36px_rgba(15,23,42,0.05)]"
      >
        <CardHeader className="pb-2 px-6 pt-6 sm:px-7">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
            Investor Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-background/75 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Debate Readiness
              </p>
              <p className="mt-1 text-2xl font-black">{investorSnapshot.readinessScore}</p>
              <p className="text-xs text-muted-foreground">Context quality score (0-100)</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/75 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Optimization Pressure
              </p>
              <p className="mt-1 text-2xl font-black">{formatPercent(investorSnapshot.optimizationPressurePct)}</p>
              <p className="text-xs text-muted-foreground">
                Portfolio value in losing positions
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/75 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Top 3 Concentration
              </p>
              <p className="mt-1 text-2xl font-black">{formatPercent(investorSnapshot.top3ConcentrationPct)}</p>
              <p className="text-xs text-muted-foreground">
                Largest three holdings share
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/75 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Estimated Annual Income
              </p>
              <p className="mt-1 text-2xl font-black">{formatCurrency(investorSnapshot.estimatedAnnualIncome)}</p>
              <p className="text-xs text-muted-foreground">
                Yield {formatPercent(investorSnapshot.annualYieldPct)}
              </p>
            </div>
          </div>

          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              {investorSnapshot.losersCount} losers / {investorSnapshot.winnersCount} winners
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              {investorSnapshot.uniqueSectors} sector buckets represented
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              Cash allocation {formatPercent(investorSnapshot.cashPct)}
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
              Fixed income {formatPercent(investorSnapshot.fixedIncomePct)} / Real assets{" "}
              {formatPercent(investorSnapshot.realAssetsPct)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        variant="muted"
        effect="fill"
        className="min-w-0 rounded-[24px] p-0 !border-transparent shadow-[0_12px_36px_rgba(15,23,42,0.05)]"
      >
        <CardHeader className="pb-2 px-6 pt-6 sm:px-7">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
              Current Holdings
            </CardTitle>
            <MorphyButton
              variant="none"
              effect="fade"
              size="sm"
              onClick={openAddHoldingModal}
            >
              <Icon icon={Plus} size="sm" className="mr-1" />
              Add Holding
            </MorphyButton>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-6 pb-6 pt-0 sm:px-7 sm:pb-7">
          <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">Change Summary</span>
              <span className="rounded-full bg-background px-2 py-0.5">Added: {holdingsChangeSummary.added}</span>
              <span className="rounded-full bg-background px-2 py-0.5">Edited: {holdingsChangeSummary.edited}</span>
              <span className="rounded-full bg-background px-2 py-0.5">Deleted: {holdingsChangeSummary.deleted}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">Bifurcation</span>
              <span className="rounded-full bg-background px-2 py-0.5">
                Equities: {holdingsBifurcation.analyzeEligible}
              </span>
              <span className="rounded-full bg-background px-2 py-0.5">
                Other Assets: {holdingsBifurcation.nonAnalyzable}
              </span>
              <span className="rounded-full bg-background px-2 py-0.5">
                Cash: {holdingsBifurcation.cashSweep}
              </span>
            </div>
          </div>

          <Tabs defaultValue="all" className="space-y-3">
            <div className="pb-1">
              <TabsList className="grid h-8 w-full grid-cols-4 gap-0.5 rounded-lg bg-background/80 p-0.5">
                <TabsTrigger
                  className="h-7 min-w-0 truncate px-1 text-[10px] leading-none sm:text-xs"
                  value="all"
                  title={`All holdings (${desktopHoldingTables.all.length})`}
                >
                  All ({desktopHoldingTables.all.length})
                </TabsTrigger>
                <TabsTrigger
                  className="h-7 min-w-0 truncate px-1 text-[10px] leading-none sm:text-xs"
                  value="analyze"
                  title={`Equities (${desktopHoldingTables.analyzeEligible.length})`}
                >
                  Equity ({desktopHoldingTables.analyzeEligible.length})
                </TabsTrigger>
                <TabsTrigger
                  className="h-7 min-w-0 truncate px-1 text-[10px] leading-none sm:text-xs"
                  value="non-analyze"
                  title={`Other assets (${desktopHoldingTables.nonAnalyzable.length})`}
                >
                  Other ({desktopHoldingTables.nonAnalyzable.length})
                </TabsTrigger>
                <TabsTrigger
                  className="h-7 min-w-0 truncate px-1 text-[10px] leading-none sm:text-xs"
                  value="cash"
                  title={`Cash holdings (${desktopHoldingTables.cashSweep.length})`}
                >
                  Cash ({desktopHoldingTables.cashSweep.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all">
              <DataTable
                columns={holdingsTableColumns}
                data={desktopHoldingTables.all}
                globalSearchKeys={["symbol", "name"]}
                searchPlaceholder="Search holdings by symbol or name..."
                initialPageSize={5}
                pageSizeOptions={[5, 10, 20]}
                rowClassName={(holding) =>
                  holding.pending_delete
                    ? "bg-muted/45 text-muted-foreground"
                    : "bg-transparent"
                }
                tableContainerClassName="w-full"
                tableClassName="w-full"
              />
            </TabsContent>

            <TabsContent value="analyze">
              <DataTable
                columns={holdingsTableColumns}
                data={desktopHoldingTables.analyzeEligible}
                globalSearchKeys={["symbol", "name"]}
                searchPlaceholder="Search equities..."
                initialPageSize={5}
                pageSizeOptions={[5, 10, 20]}
                rowClassName={(holding) =>
                  holding.pending_delete
                    ? "bg-muted/45 text-muted-foreground"
                    : "bg-transparent"
                }
                tableContainerClassName="w-full"
                tableClassName="w-full"
              />
            </TabsContent>

            <TabsContent value="non-analyze">
              <DataTable
                columns={holdingsTableColumns}
                data={desktopHoldingTables.nonAnalyzable}
                globalSearchKeys={["symbol", "name"]}
                searchPlaceholder="Search other assets..."
                initialPageSize={5}
                pageSizeOptions={[5, 10, 20]}
                rowClassName={(holding) =>
                  holding.pending_delete
                    ? "bg-muted/45 text-muted-foreground"
                    : "bg-transparent"
                }
                tableContainerClassName="w-full"
                tableClassName="w-full"
              />
            </TabsContent>

            <TabsContent value="cash">
              <DataTable
                columns={holdingsTableColumns}
                data={desktopHoldingTables.cashSweep}
                globalSearchKeys={["symbol", "name"]}
                searchPlaceholder="Search cash holdings..."
                initialPageSize={5}
                pageSizeOptions={[5, 10, 20]}
                rowClassName={(holding) =>
                  holding.pending_delete
                    ? "bg-muted/45 text-muted-foreground"
                    : "bg-transparent"
                }
                tableContainerClassName="w-full"
                tableClassName="w-full"
              />
            </TabsContent>
          </Tabs>

          {hasHoldingsChanges ? (
            <div className="pt-2">
              <MorphyButton
                variant="blue-gradient"
                effect="fade"
                fullWidth
                onClick={() => void persistHoldingsChanges()}
                disabled={isSavingHoldings}
                className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
              >
                <Icon icon={Save} size="sm" className="mr-2" />
                {isSavingHoldings ? "Saving Holdings..." : "Save Holdings Changes"}
              </MorphyButton>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="app-section-heading px-1 uppercase tracking-[0.12em] text-muted-foreground">
          Portfolio Insights
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {model.quality.allocationReady ? (
            <Card variant="none" effect="glass" className="min-w-0 overflow-hidden rounded-[22px]">
              <CardHeader className="pb-2 px-5 pt-5">
                <CardTitle className="text-sm">Allocation Mix</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-0">
                <AssetAllocationDonut data={allocationData} height={240} />
              </CardContent>
            </Card>
          ) : (
            <DataQualityFallback
              title="Allocation Mix"
              detail="Insufficient statement allocation fields to build a reliable mix chart."
            />
          )}

          {model.quality.historyReady ? (
            <PortfolioHistoryChart
              data={model.history}
              beginningValue={model.hero.beginningValue}
              endingValue={model.hero.endingValue}
              statementPeriod={model.hero.statementPeriod}
              className="h-full min-w-0 overflow-hidden rounded-[22px]"
            />
          ) : (
            <DataQualityFallback
              title="Portfolio History"
              detail="Insufficient statement period values to plot a defensible history trend."
            />
          )}

          {model.quality.gainLossReady ? (
            <GainLossDistributionChart
              className="min-w-0 overflow-hidden rounded-[22px]"
              data={model.gainLossDistribution}
            />
          ) : (
            <DataQualityFallback
              title="Gain/Loss Distribution"
              detail="Statement lacks enough gain/loss percentages to build a reliable distribution."
            />
          )}

          {model.quality.concentrationReady ? (
            <HoldingsConcentrationChart
              className="min-w-0 overflow-hidden rounded-[22px]"
              data={model.concentration}
            />
          ) : (
            <DataQualityFallback
              title="Holdings Concentration"
              detail="Need at least three measurable holdings to compute concentration safely."
            />
          )}
        </div>
      </section>

      <Card variant="none" effect="glass" className="min-w-0 overflow-hidden rounded-[22px]">
        <CardContent className="p-4 sm:p-5">
          <ProfileBasedPicksList
            userId={userId}
            vaultOwnerToken={vaultOwnerToken}
            symbols={holdingSymbols}
            onAdd={(symbol) => onAnalyzeStock?.(symbol)}
          />
        </CardContent>
      </Card>

      <Card variant="none" effect="glass" className="min-w-0 overflow-hidden rounded-[24px]">
        <CardHeader className="pb-2 px-5 pt-5 sm:px-6 sm:pt-6">
          <CardTitle className="text-sm">Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
          <p className="text-xs text-muted-foreground">
            {KAI_EXPERIENCE_CONTRACT.decisionConviction.dashboardRecommendationsDescription}
          </p>
          {model.recommendations.map((item) => (
            <div key={item.title} className="rounded-xl border border-border/60 bg-background/70 p-3">
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card variant="none" effect="glass" className="rounded-[24px]">
        <CardContent className="flex flex-col gap-3 p-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p>Imported statement data is synced across dashboard and holdings views.</p>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
            <MorphyButton
              variant="none"
              effect="fade"
              size="sm"
              fullWidth
              disabled={isDeletingImportedData}
              onClick={onReupload}
            >
              Import Portfolio
            </MorphyButton>
            <MorphyButton
              variant="none"
              effect="fade"
              size="sm"
              fullWidth
              className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              disabled={isDeletingImportedData}
              onClick={() => setDeleteImportedDialogOpen(true)}
            >
              {isDeletingImportedData ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Delete Imported Data
            </MorphyButton>
          </div>
        </CardContent>
      </Card>

      <EditHoldingModal
        isOpen={isModalOpen}
        onClose={closeHoldingModal}
        holding={editingHolding}
        onSave={handleSaveHolding}
      />

      <AlertDialog
        open={deleteImportedDialogOpen}
        onOpenChange={(open) => {
          if (isDeletingImportedData) return;
          setDeleteImportedDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Imported Portfolio Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes imported holdings and statement snapshots from your Vault. Profile
              and consent data are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingImportedData}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingImportedData}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteImportedData();
              }}
            >
              {isDeletingImportedData ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
