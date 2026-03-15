"use client";

import { Activity, ChartColumnIncreasing, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/lib/morphy-ux/card";
import { Icon } from "@/lib/morphy-ux/ui";
import { cn } from "@/lib/utils";

export interface MarketOverviewMetric {
  id?: string;
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  icon: LucideIcon;
}

const FALLBACK_ICON: Record<MarketOverviewMetric["tone"], LucideIcon> = {
  positive: TrendingUp,
  negative: TrendingDown,
  neutral: ChartColumnIncreasing,
  warning: Activity,
};

export function MarketOverviewGrid({ metrics = [] }: { metrics?: MarketOverviewMetric[] }) {
  if (!metrics.length) {
    return (
      <Card variant="muted" effect="fill" className="rounded-xl p-0">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Market overview metrics are not available at the moment.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card
          key={metric.id || metric.label}
          variant="none"
          effect="glass"
          className="rounded-[20px] border-foreground/10 p-0"
        >
          <CardContent className="flex min-h-[84px] flex-col justify-between p-3.5 sm:min-h-[90px] sm:p-4">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border shadow-sm sm:h-9 sm:w-9",
                  metric.tone === "positive" && "border-emerald-500/18 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  metric.tone === "negative" && "border-rose-500/18 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                  metric.tone === "warning" && "border-amber-500/18 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  metric.tone === "neutral" && "border-sky-500/18 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                )}
              >
                <Icon icon={metric.icon || FALLBACK_ICON[metric.tone]} size="sm" />
              </span>
              <div className="min-w-0">
                <span className="text-xs font-semibold leading-5 text-muted-foreground">
                  {metric.label}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold leading-none tracking-tight text-foreground sm:text-lg">
                {metric.value}
              </p>
              <p
                className={cn(
                  "text-xs font-medium",
                  metric.tone === "positive" && "text-emerald-600 dark:text-emerald-400",
                  metric.tone === "negative" && "text-rose-600 dark:text-rose-400",
                  metric.tone === "warning" && "text-orange-600 dark:text-orange-400",
                  metric.tone === "neutral" && "text-muted-foreground"
                )}
              >
                {metric.delta}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
