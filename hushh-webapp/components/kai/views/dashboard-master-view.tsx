"use client";

import { useMemo } from "react";
import { Clock3, SlidersHorizontal, Sparkles } from "lucide-react";

import { AllocationStrip } from "@/components/kai/cards/allocation-strip";
import { DashboardSummaryHero } from "@/components/kai/cards/dashboard-summary-hero";
import { HoldingPositionCard, type HoldingPosition } from "@/components/kai/cards/holding-position-card";
import { NewHoldingCtaCard } from "@/components/kai/cards/new-holding-cta-card";
import { PortfolioMetricsCard } from "@/components/kai/cards/portfolio-metrics-card";
import { ProfileBasedPicksList } from "@/components/kai/cards/profile-based-picks-list";
import { TopMoversCard } from "@/components/kai/cards/top-movers-card";
import type { PortfolioData } from "@/components/kai/views/dashboard-view";
import { Button as MorphyButton } from "@/lib/morphy-ux/button";
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-[calc(144px+var(--app-bottom-inset))] pt-2 sm:px-6">
      <DashboardSummaryHero
        totalValue={totalValue}
        netChange={netChange}
        changePct={changePct}
        holdingsCount={holdings.length}
        riskLabel={riskBucket}
        periodRange={parseDateRange(portfolioData)}
        beginningBalance={beginningValue > 0 ? beginningValue : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MorphyButton variant="none" effect="fade" fullWidth onClick={onManagePortfolio}>
          <Icon icon={SlidersHorizontal} size="sm" className="mr-2" />
          Manage
        </MorphyButton>
        <MorphyButton variant="none" effect="fade" fullWidth onClick={onViewHistory}>
          <Icon icon={Clock3} size="sm" className="mr-2" />
          History
        </MorphyButton>
        <MorphyButton variant="none" effect="fade" fullWidth onClick={onAnalyzeLosers}>
          <Icon icon={Sparkles} size="sm" className="mr-2" />
          Optimize
        </MorphyButton>
      </div>

      <AllocationStrip cashPct={cashPct} equitiesPct={equitiesPct} bondsPct={bondsPct} />

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

      <NewHoldingCtaCard
        onAddHolding={onManagePortfolio}
        onImportStatement={() => onReupload?.()}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <PortfolioMetricsCard holdings={holdingsForCards} totalValue={totalValue} />
        <TopMoversCard holdings={holdingsForCards} />
      </div>

      <ProfileBasedPicksList
        onAdd={(symbol) => {
          if (onAnalyzeStock) {
            onAnalyzeStock(symbol);
            return;
          }
          onManagePortfolio();
        }}
      />
    </div>
  );
}
