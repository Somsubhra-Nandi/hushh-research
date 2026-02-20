"use client";

import { useMemo } from "react";
import { Clock3, SlidersHorizontal, Sparkles } from "lucide-react";

import { AllocationStrip } from "@/components/kai/cards/allocation-strip";
import { DashboardSummaryHero } from "@/components/kai/cards/dashboard-summary-hero";
import { HoldingPositionCard, type HoldingPosition } from "@/components/kai/cards/holding-position-card";
import { NewHoldingCtaCard } from "@/components/kai/cards/new-holding-cta-card";
import { PortfolioMetricsCard } from "@/components/kai/cards/portfolio-metrics-card";
import { TopMoversCard } from "@/components/kai/cards/top-movers-card";
import type { PortfolioData } from "@/components/kai/types/portfolio";
import { Button as MorphyButton } from "@/lib/morphy-ux/button";
import { Card, CardContent } from "@/lib/morphy-ux/card";
import { Icon } from "@/lib/morphy-ux/ui";

interface DashboardMasterViewProps {
  portfolioData: PortfolioData;
  onManagePortfolio: () => void;
  onAnalyzeStock?: (symbol: string) => void;
  onAnalyzeLosers?: () => void;
  onReupload?: () => void;
  onViewHistory?: () => void;
}

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function parseDateRange(portfolioData: PortfolioData): string | undefined {
  const start = portfolioData.account_info?.statement_period_start;
  const end = portfolioData.account_info?.statement_period_end;
  if (!start || !end) return undefined;

  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const formatter = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
  } catch {
    return undefined;
  }
}

function formatConfidence(value: number | undefined): string | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return `${pct.toFixed(0)}% confidence`;
}

function toPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

function toHoldingPositions(portfolioData: PortfolioData): HoldingPosition[] {
  const source = portfolioData.holdings ?? portfolioData.detailed_holdings ?? [];
  return source
    .filter((holding) => typeof holding.symbol === "string" && holding.symbol.trim().length > 0)
    .map((holding) => {
      const marketValue = safeNumber(holding.market_value, 0);
      const gainLossValue = safeNumber(holding.unrealized_gain_loss, 0);
      const gainLossPct =
        typeof holding.unrealized_gain_loss_pct === "number"
          ? holding.unrealized_gain_loss_pct
          : marketValue > 0 && holding.cost_basis
          ? ((marketValue - holding.cost_basis) / holding.cost_basis) * 100
          : 0;

      return {
        symbol: holding.symbol,
        name: holding.name || holding.symbol,
        quantity: safeNumber(holding.quantity, 0),
        price: safeNumber(holding.price, 0),
        marketValue,
        gainLossValue,
        gainLossPct,
      };
    });
}

export function DashboardMasterView({
  portfolioData,
  onManagePortfolio,
  onAnalyzeStock,
  onAnalyzeLosers,
  onReupload,
  onViewHistory,
}: DashboardMasterViewProps) {
  const holdings = useMemo(() => toHoldingPositions(portfolioData), [portfolioData]);
  const holdingsForCards = useMemo(
    () =>
      holdings.map((holding) => ({
        symbol: holding.symbol,
        name: holding.name,
        market_value: holding.marketValue,
        quantity: holding.quantity,
        price: holding.price,
        unrealized_gain_loss: holding.gainLossValue,
        unrealized_gain_loss_pct: holding.gainLossPct,
      })),
    [holdings]
  );

  const totalValue =
    safeNumber(portfolioData.total_value, 0) ||
    safeNumber(portfolioData.account_summary?.ending_value, 0) ||
    holdings.reduce((sum, holding) => sum + holding.marketValue, 0);

  const beginningValue = safeNumber(portfolioData.account_summary?.beginning_value, 0);
  const netChange =
    safeNumber(portfolioData.account_summary?.change_in_value, 0) || totalValue - beginningValue;
  const changePct = beginningValue > 0 ? (netChange / beginningValue) * 100 : 0;

  const allocation = portfolioData.asset_allocation;
  const cashPct =
    allocation && !Array.isArray(allocation)
      ? safeNumber(allocation.cash_pct ?? allocation.cash_percent, 0)
      : 0;
  const equitiesPct =
    allocation && !Array.isArray(allocation)
      ? safeNumber(allocation.equities_pct ?? allocation.equities_percent, 0)
      : 0;
  const bondsPct =
    allocation && !Array.isArray(allocation)
      ? safeNumber(allocation.bonds_pct ?? allocation.bonds_percent, 0)
      : 0;

  const riskBucket = holdings.length > 0 ? "Moderate" : "Unknown";
  const hasAllocation = cashPct > 0 || equitiesPct > 0 || bondsPct > 0;
  const hasHoldings = holdings.length > 0;
  const brokerageName = portfolioData.account_info?.brokerage_name;
  const qualityReport = portfolioData.quality_report;
  const confidenceLabel = formatConfidence(qualityReport?.average_confidence);
  const rawCount = safeNumber(qualityReport?.raw, 0);
  const validatedCount = safeNumber(qualityReport?.validated, 0);
  const aggregatedCount = safeNumber(qualityReport?.aggregated, 0);
  const validationPct = toPercent(validatedCount, rawCount);
  const aggregationPct = toPercent(aggregatedCount, validatedCount || rawCount);
  const droppedReasons = Object.entries(qualityReport?.dropped_reasons ?? {})
    .sort((a, b) => (safeNumber(b[1], 0) - safeNumber(a[1], 0)))
    .slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-[calc(144px+var(--app-bottom-inset))] pt-2 sm:px-6">
      <DashboardSummaryHero
        totalValue={totalValue}
        netChange={netChange}
        changePct={changePct}
        holdingsCount={holdings.length}
        riskLabel={riskBucket}
        brokerageName={brokerageName}
        periodRange={parseDateRange(portfolioData)}
        beginningBalance={beginningValue > 0 ? beginningValue : undefined}
      />

      {(brokerageName || parseDateRange(portfolioData) || qualityReport) && (
        <Card variant="none" effect="glass">
          <CardContent className="space-y-2 p-4">
            <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              Data Provenance
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {brokerageName && (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5">
                  Source: {brokerageName}
                </span>
              )}
              {parseDateRange(portfolioData) && (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5">
                  Statement: {parseDateRange(portfolioData)}
                </span>
              )}
              {typeof qualityReport?.aggregated === "number" && (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5">
                  Holdings: {qualityReport.aggregated}
                </span>
              )}
              {confidenceLabel && (
                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5">
                  {confidenceLabel}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {qualityReport && (
        <Card variant="none" effect="glass">
          <CardContent className="space-y-3 p-4">
            <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              Data Quality
            </h3>

            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-background/60 p-2">
                <p className="text-muted-foreground">Raw rows</p>
                <p className="text-sm font-semibold">{rawCount}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 p-2">
                <p className="text-muted-foreground">Validated</p>
                <p className="text-sm font-semibold">{validatedCount}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 p-2">
                <p className="text-muted-foreground">Aggregated</p>
                <p className="text-sm font-semibold">{aggregatedCount}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Validation completeness</span>
                  <span className="font-medium">{validationPct.toFixed(0)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full bg-[var(--brand-500)] transition-all"
                    style={{ width: `${validationPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Aggregation quality</span>
                  <span className="font-medium">{aggregationPct.toFixed(0)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full bg-[var(--tone-green)] transition-all"
                    style={{ width: `${aggregationPct}%` }}
                  />
                </div>
              </div>
            </div>

            {droppedReasons.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Top filtered reasons</p>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {droppedReasons.map(([reason, count]) => (
                    <span
                      key={reason}
                      className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5"
                    >
                      {reason}: {safeNumber(count, 0)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <MorphyButton
          variant="none"
          effect="fade"
          fullWidth
          onClick={onManagePortfolio}
          disabled={!hasHoldings}
        >
          <Icon icon={SlidersHorizontal} size="sm" className="mr-2" />
          Manage
        </MorphyButton>
        <MorphyButton
          variant="none"
          effect="fade"
          fullWidth
          onClick={onViewHistory}
          disabled={!hasHoldings}
        >
          <Icon icon={Clock3} size="sm" className="mr-2" />
          History
        </MorphyButton>
        <MorphyButton
          variant="none"
          effect="fade"
          fullWidth
          onClick={onAnalyzeLosers}
          disabled={!hasHoldings}
        >
          <Icon icon={Sparkles} size="sm" className="mr-2" />
          Optimize
        </MorphyButton>
      </div>

      {hasAllocation && (
        <AllocationStrip cashPct={cashPct} equitiesPct={equitiesPct} bondsPct={bondsPct} />
      )}

      {hasHoldings ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              Current Holdings
            </h3>
            <MorphyButton variant="none" effect="fade" size="sm" onClick={onManagePortfolio}>
              Manage Portfolio
            </MorphyButton>
          </div>

          <div className="space-y-3">
            {holdings.slice(0, 6).map((holding) => (
              <HoldingPositionCard
                key={`${holding.symbol}-${holding.name}`}
                holding={holding}
                onAnalyze={(symbol) => onAnalyzeStock?.(symbol)}
                onManage={(_symbol, _action) => onManagePortfolio()}
              />
            ))}
          </div>
        </section>
      ) : (
        <Card variant="none" effect="glass" showRipple={false}>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-black">No holdings loaded yet</h3>
            <p className="text-xs text-muted-foreground">
              Connect your statement to generate data-bound portfolio insights.
            </p>
            <MorphyButton size="default" fullWidth onClick={() => onReupload?.()}>
              Import Portfolio
            </MorphyButton>
          </CardContent>
        </Card>
      )}

      {hasHoldings && (
        <>
          <NewHoldingCtaCard
            onAddHolding={onManagePortfolio}
            onImportStatement={() => onReupload?.()}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <PortfolioMetricsCard holdings={holdingsForCards} totalValue={totalValue} />
            <TopMoversCard holdings={holdingsForCards} />
          </div>
        </>
      )}

      {!hasHoldings && (
        <div className="grid gap-3 md:grid-cols-2">
          <TopMoversCard holdings={holdingsForCards} />
        </div>
      )}
    </div>
  );
}
