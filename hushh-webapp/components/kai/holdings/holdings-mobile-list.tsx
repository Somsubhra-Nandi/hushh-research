"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { Holding as PortfolioHolding } from "@/components/kai/types/portfolio";
import {
  HoldingMobileCard,
  type HoldingMobileCardViewModel,
} from "@/components/kai/holdings/holding-mobile-card";
import { HoldingDetailsDrawer } from "@/components/kai/holdings/holding-details-drawer";
import { cn } from "@/lib/utils";

type HoldingsFilter = "all" | "winners" | "losers" | "cash";

export type HoldingsListItem = PortfolioHolding & {
  client_id: string;
  pending_delete?: boolean;
};

interface HoldingsMobileListProps {
  holdings: HoldingsListItem[];
  canManageHoldings?: boolean;
  onEditHolding: (holdingId: string) => void;
  onToggleDeleteHolding: (holdingId: string) => void;
}

function toFiniteNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function resolveGainLossValue(holding: HoldingsListItem): number | null {
  const explicit = toFiniteNumber(holding.unrealized_gain_loss);
  if (explicit !== null) return explicit;
  const marketValue = toFiniteNumber(holding.market_value);
  const costBasis = toFiniteNumber(holding.cost_basis);
  if (marketValue !== null && costBasis !== null) return marketValue - costBasis;
  return null;
}

function resolveGainLossPct(holding: HoldingsListItem, gainLossValue: number | null): number | null {
  const explicitPct = toFiniteNumber(holding.unrealized_gain_loss_pct);
  if (explicitPct !== null) return explicitPct;
  const costBasis = toFiniteNumber(holding.cost_basis);
  if (gainLossValue !== null && costBasis !== null && costBasis !== 0) {
    return (gainLossValue / costBasis) * 100;
  }
  return null;
}

function resolveAveragePrice(holding: HoldingsListItem): number | null {
  const quantity = toFiniteNumber(holding.quantity);
  const costBasis = toFiniteNumber(holding.cost_basis);
  if (costBasis !== null && quantity !== null && quantity > 0) {
    return costBasis / quantity;
  }
  return toFiniteNumber(holding.price);
}

function resolveCurrentPrice(holding: HoldingsListItem): number | null {
  return toFiniteNumber(holding.price);
}

function resolveWeightPct(holding: HoldingsListItem, totalMarketValue: number): number {
  const marketValue = toFiniteNumber(holding.market_value) || 0;
  if (totalMarketValue <= 0) return 0;
  return (marketValue / totalMarketValue) * 100;
}

function resolveSector(holding: HoldingsListItem): string | null {
  const raw = String(holding.sector || holding.asset_type || holding.asset_class || "").trim();
  return raw.length > 0 ? raw : null;
}

function holdingDirection(holding: HoldingMobileCardViewModel): number {
  if (holding.gainLossPct !== null) {
    if (holding.gainLossPct > 0) return 1;
    if (holding.gainLossPct < 0) return -1;
  }
  if (holding.gainLossValue !== null) {
    if (holding.gainLossValue > 0) return 1;
    if (holding.gainLossValue < 0) return -1;
  }
  return 0;
}

function toCardViewModel(holding: HoldingsListItem, totalMarketValue: number): HoldingMobileCardViewModel {
  const marketValue = toFiniteNumber(holding.market_value) || 0;
  const shares = toFiniteNumber(holding.quantity) || 0;
  const gainLossValue = resolveGainLossValue(holding);
  const gainLossPct = resolveGainLossPct(holding, gainLossValue);

  return {
    id: holding.client_id,
    symbol: String(holding.symbol || "").trim() || "—",
    name: String(holding.name || "").trim() || "Unnamed security",
    marketValue,
    shares,
    gainLossValue,
    gainLossPct,
    averagePrice: resolveAveragePrice(holding),
    currentPrice: resolveCurrentPrice(holding),
    portfolioWeightPct: resolveWeightPct(holding, totalMarketValue),
    sector: resolveSector(holding),
    isCash: holding.is_cash_equivalent === true,
    pendingDelete: Boolean(holding.pending_delete),
  };
}

const FILTERS: Array<{ key: HoldingsFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "winners", label: "Winners" },
  { key: "losers", label: "Losers" },
  { key: "cash", label: "Cash" },
];
const HOLDINGS_PAGE_SIZE = 5;

export function HoldingsMobileList({
  holdings,
  canManageHoldings = true,
  onEditHolding,
  onToggleDeleteHolding,
}: HoldingsMobileListProps) {
  const [activeFilter, setActiveFilter] = useState<HoldingsFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalMarketValue = useMemo(() => {
    const activeTotal = holdings
      .filter((holding) => !holding.pending_delete)
      .reduce((sum, holding) => sum + (toFiniteNumber(holding.market_value) || 0), 0);
    if (activeTotal > 0) return activeTotal;
    return holdings.reduce((sum, holding) => sum + (toFiniteNumber(holding.market_value) || 0), 0);
  }, [holdings]);

  const holdingsViewModels = useMemo(
    () =>
      holdings
        .map((holding) => toCardViewModel(holding, totalMarketValue))
        .sort((a, b) => {
          if (b.portfolioWeightPct !== a.portfolioWeightPct) {
            return b.portfolioWeightPct - a.portfolioWeightPct;
          }
          if (b.marketValue !== a.marketValue) {
            return b.marketValue - a.marketValue;
          }
          return a.symbol.localeCompare(b.symbol, undefined, {
            sensitivity: "base",
            numeric: true,
          });
        }),
    [holdings, totalMarketValue]
  );

  const filterCounts = useMemo(() => {
    let winners = 0;
    let losers = 0;
    let cash = 0;
    for (const holding of holdingsViewModels) {
      const direction = holdingDirection(holding);
      if (direction > 0) winners += 1;
      if (direction < 0) losers += 1;
      if (holding.isCash) cash += 1;
    }
    return {
      all: holdingsViewModels.length,
      winners,
      losers,
      cash,
    };
  }, [holdingsViewModels]);

  const filteredHoldings = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return holdingsViewModels.filter((holding) => {
      if (activeFilter === "winners" && holdingDirection(holding) <= 0) return false;
      if (activeFilter === "losers" && holdingDirection(holding) >= 0) return false;
      if (activeFilter === "cash" && !holding.isCash) return false;

      if (!query) return true;
      return (
        holding.symbol.toLowerCase().includes(query) ||
        holding.name.toLowerCase().includes(query)
      );
    });
  }, [activeFilter, holdingsViewModels, searchTerm]);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredHoldings.length / HOLDINGS_PAGE_SIZE)),
    [filteredHoldings.length]
  );
  const paginatedHoldings = useMemo(() => {
    const startIndex = (currentPage - 1) * HOLDINGS_PAGE_SIZE;
    return filteredHoldings.slice(startIndex, startIndex + HOLDINGS_PAGE_SIZE);
  }, [currentPage, filteredHoldings]);

  const selectedHolding = useMemo(
    () => holdingsViewModels.find((holding) => holding.id === selectedHoldingId) || null,
    [holdingsViewModels, selectedHoldingId]
  );

  useEffect(() => {
    if (!selectedHoldingId) return;
    if (holdingsViewModels.some((holding) => holding.id === selectedHoldingId)) return;
    setSelectedHoldingId(null);
  }, [holdingsViewModels, selectedHoldingId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchTerm]);

  useEffect(() => {
    if (currentPage <= totalPages) return;
    setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <>
      <div className="space-y-3">
        <div className="grid h-10 w-full grid-cols-4 gap-1 rounded-xl bg-background/80 p-0.5">
          {FILTERS.map((filter) => {
            const selected = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={cn(
                  "app-button-text h-9 rounded-lg px-1 leading-none transition-colors",
                  selected
                    ? "app-button-black"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={selected}
              >
                {filter.label} ({filterCounts[filter.key]})
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search holdings by ticker or company"
            className="app-body-text h-10 rounded-full border-border/60 bg-background/70 pl-9 pr-4 text-sm"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {filteredHoldings.length > 0 ? (
          <div className="space-y-1.5">
            {paginatedHoldings.map((holding) => (
              <HoldingMobileCard
                key={holding.id}
                holding={holding}
                onOpen={() => setSelectedHoldingId(holding.id)}
              />
            ))}

            {totalPages > 1 ? (
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage <= 1}
                  className={cn(
                    "app-button-text h-9 min-w-20 rounded-lg px-3 transition-colors",
                    currentPage <= 1
                      ? "cursor-not-allowed bg-black/40 text-white/60"
                      : "app-button-black hover:bg-black/90"
                  )}
                >
                  Previous
                </button>

                <p className="app-label-text">
                  Page {currentPage} of {totalPages}
                </p>

                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage >= totalPages}
                  className={cn(
                    "app-button-text h-9 min-w-20 rounded-lg px-3 transition-colors",
                    currentPage >= totalPages
                      ? "cursor-not-allowed bg-black/40 text-white/60"
                      : "app-button-black hover:bg-black/90"
                  )}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/50 px-4 py-6 text-center text-sm text-muted-foreground">
            No holdings match this filter.
          </div>
        )}
      </div>

      <HoldingDetailsDrawer
        open={Boolean(selectedHolding)}
        holding={selectedHolding}
        canManageHoldings={canManageHoldings}
        onOpenChange={(open) => {
          if (!open) setSelectedHoldingId(null);
        }}
        onEdit={() => {
          if (!selectedHolding) return;
          onEditHolding(selectedHolding.id);
          setSelectedHoldingId(null);
        }}
        onToggleDelete={() => {
          if (!selectedHolding) return;
          onToggleDeleteHolding(selectedHolding.id);
          setSelectedHoldingId(null);
        }}
      />
    </>
  );
}
