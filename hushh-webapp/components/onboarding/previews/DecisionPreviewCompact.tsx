"use client";

import { Card } from "@/lib/morphy-ux/card";
import { Icon } from "@/lib/morphy-ux/ui";
import { CheckCircle, PlusCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const ANALYSIS_ROWS = [
  {
    label: "COMPANY STRENGTH",
    text: "Record vehicle deliveries and expanding margins",
    icon: CheckCircle,
  },
  {
    label: "MARKET TREND",
    text: "Strong upward momentum and institutional backing",
    icon: TrendingUp,
  },
  {
    label: "PRICE VALUE",
    text: "Attractive entry point for long-term growth",
    icon: PlusCircle,
  },
] as const;

export function DecisionPreviewCompact() {
  return (
    <Card
      variant="none"
      effect="glass"
      preset="hero"
      showRipple={false}
      className="h-full w-full"
    >
      <div className="morphy-theme-content p-5">
        <div className="rounded-2xl border border-background/70 bg-background/55 p-5">
          <div className="mb-5 flex items-center justify-between border-b border-border/70 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-black text-[11px] font-extrabold text-white dark:bg-white dark:text-black">
                TSLA
              </div>
              <p className="text-[19px] font-bold tracking-tight">TSLA</p>
            </div>
            <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              Analysis
            </span>
          </div>

          <div className="space-y-4">
            {ANALYSIS_ROWS.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-sm font-medium leading-tight">{item.text}</p>
                </div>
                <Icon icon={item.icon} size="lg" className="shrink-0 text-[var(--tone-orange)]" />
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-border/70 pt-5">
            <div className="mb-3 flex w-full gap-2">
              <ActionPill active label="BUY" />
              <ActionPill label="HOLD" />
              <ActionPill label="SELL" />
            </div>
            <p className="text-center text-[13px] font-medium text-muted-foreground">
              Conviction: High · Horizon: 12+ months
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ActionPill({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className={cn(
        "flex-1 rounded-xl px-2 py-2.5 text-center text-[13px] font-semibold",
        active
          ? "bg-emerald-500 text-white dark:bg-emerald-400 dark:text-black"
          : "border border-border/70 bg-muted/45 text-muted-foreground"
      )}
    >
      {label}
    </div>
  );
}
