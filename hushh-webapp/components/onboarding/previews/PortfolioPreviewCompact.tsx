"use client";

import { Card } from "@/lib/morphy-ux/card";
import { Icon } from "@/lib/morphy-ux/ui";
import { TrendingUp } from "lucide-react";

export function PortfolioPreviewCompact() {
  return (
    <Card
      variant="none"
      effect="glass"
      preset="hero"
      showRipple={false}
      className="h-full w-full"
    >
      <div className="morphy-theme-content p-7">
        <div className="space-y-5">
          <div className="space-y-1 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Total Value
            </p>
            <p className="text-[2.45rem] font-black tracking-tight">$142,893</p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-900/30 dark:text-emerald-300">
              <Icon icon={TrendingUp} size="xs" />
              +2.4%
              <span className="text-muted-foreground">Overall</span>
            </div>
          </div>

          <div className="h-px bg-border/70" />

          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <h3 className="text-sm font-semibold">Allocation</h3>
              <span className="text-xs text-muted-foreground">Equity Heavy</span>
            </div>

            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
              <div className="w-[65%] bg-foreground/85" />
              <div className="w-[20%] bg-foreground/45" />
              <div className="w-[15%] bg-foreground/15" />
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] font-medium text-muted-foreground">
              <LegendDot label="Stocks" tone="bg-foreground/85" />
              <LegendDot label="Bonds" tone="bg-foreground/45" />
              <LegendDot label="Cash" tone="bg-foreground/15" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
              Top Performer
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[17px] font-bold leading-tight">TSLA</p>
                <p className="mt-0.5 text-[13px] font-semibold text-emerald-600 dark:text-emerald-300">
                  +5.2%
                </p>
              </div>
              <svg
                viewBox="0 0 100 30"
                preserveAspectRatio="none"
                className="h-8 w-24 overflow-visible"
                aria-hidden
              >
                <path
                  d="M0,25 Q15,28 25,20 T50,15 T75,10 T100,2"
                  fill="none"
                  stroke="currentColor"
                  className="text-emerald-500"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-background/70 bg-background/45 p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Risk Level</p>
              <p className="text-[15px] font-semibold">Moderate</p>
            </div>
            <div className="flex gap-1">
              <RiskBar active />
              <RiskBar active />
              <RiskBar active soft />
              <RiskBar />
              <RiskBar />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LegendDot({ label, tone }: { label: string; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

function RiskBar({ active = false, soft = false }: { active?: boolean; soft?: boolean }) {
  const base =
    "h-6 w-1.5 rounded-full " +
    (active
      ? soft
        ? "bg-violet-500/40 dark:bg-violet-300/45"
        : "bg-violet-500 dark:bg-violet-300"
      : "bg-foreground/15");
  return <span className={base} aria-hidden />;
}
