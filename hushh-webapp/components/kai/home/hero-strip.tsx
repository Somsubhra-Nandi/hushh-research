"use client";

import { RefreshCcw, TrendingDown, TrendingUp } from "lucide-react";

import type { KaiHomeHero } from "@/lib/services/api-service";
import { Button } from "@/lib/morphy-ux/button";
import { Card, CardContent } from "@/lib/morphy-ux/card";
import { cn } from "@/lib/utils";

interface HeroStripProps {
  hero?: KaiHomeHero;
  stale?: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
  onOpenDashboard: () => void;
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function Sparkline({ points }: { points: { t: number; p: number }[] }) {
  if (!points || points.length < 2) {
    return <div className="h-14 rounded-lg border border-dashed border-border/70 bg-muted/20" />;
  }

  const values = points.map((point) => point.p);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-6, max - min);

  const polyline = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 100 - ((point.p - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="h-14 w-full overflow-visible">
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className="text-foreground/80"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HeroStrip({
  hero,
  stale,
  refreshing,
  onRefresh,
  onOpenDashboard,
}: HeroStripProps) {
  const hasTotalValue = typeof hero?.total_value === "number" && Number.isFinite(hero.total_value);
  const hasPositiveDelta = typeof hero?.day_change_pct === "number" && hero.day_change_pct >= 0;
  const trackedCount =
    typeof hero?.holdings_count === "number" && Number.isFinite(hero.holdings_count)
      ? Math.max(0, hero.holdings_count)
      : null;
  const primaryValue = hasTotalValue
    ? formatCurrency(hero?.total_value)
    : trackedCount !== null
      ? `${trackedCount} holdings`
      : "Holdings loaded";

  return (
    <Card variant="none" effect="glass" className="rounded-2xl p-0">
      <CardContent className="space-y-5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              Top Holdings Overview
            </p>
            <p className="mt-1 text-2xl font-black tracking-tight">{primaryValue}</p>
            <div className="mt-1 flex items-center gap-2 text-xs">
              {typeof hero?.day_change_pct === "number" && Number.isFinite(hero.day_change_pct) ? (
                <>
                  {hasPositiveDelta ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                  )}
                  <span
                    className={cn(
                      "font-semibold",
                      hasPositiveDelta ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {formatPercent(hero?.day_change_pct)}
                  </span>
                  {typeof hero?.day_change_value === "number" && Number.isFinite(hero.day_change_value) ? (
                    <span className="text-muted-foreground">({formatCurrency(hero.day_change_value)})</span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {hero?.portfolio_value_bucket
                    ? `Portfolio band: ${hero.portfolio_value_bucket}`
                    : trackedCount !== null
                      ? `${trackedCount} holdings tracked live`
                      : "Live holdings context"}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="none"
              effect="fade"
              size="sm"
              onClick={onRefresh}
              aria-label="Refresh market home"
              disabled={Boolean(refreshing)}
            >
              <RefreshCcw className={cn("h-4 w-4", refreshing && "animate-pulse")} />
            </Button>
            <Button variant="blue-gradient" effect="fill" size="sm" onClick={onOpenDashboard}>
              Open Dashboard
            </Button>
          </div>
        </div>

        <Sparkline points={hero?.sparkline_points || []} />

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
              stale ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            )}
          >
            {stale ? "Partial" : "Live"}
          </span>
          {hero?.degraded ? (
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              Degraded
            </span>
          ) : null}
          {(hero?.source_tags || []).slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-background/70 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
