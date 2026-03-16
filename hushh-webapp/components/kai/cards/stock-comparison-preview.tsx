"use client";

import { BarChart3, GitCompareArrows, Loader2, SearchCheck } from "lucide-react";

import { SectionHeader } from "@/components/app-ui/page-sections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/lib/morphy-ux/button";
import { type KaiStockPreviewResponse } from "@/lib/services/api-service";
import { cn } from "@/lib/utils";

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Price unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Change unavailable";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatFcf(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `$${value.toFixed(value >= 10 ? 0 : 1)}B FCF`;
}

export function StockComparisonPreview({
  preview,
  loading = false,
  error,
  onStartDebate,
  onOpenFullAnalysis,
  compact = false,
  showOpenFullAnalysis = true,
}: {
  preview: KaiStockPreviewResponse | null;
  loading?: boolean;
  error?: string | null;
  onStartDebate: () => void;
  onOpenFullAnalysis: () => void;
  compact?: boolean;
  showOpenFullAnalysis?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-border/80 bg-background/90 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.25)]",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-6"
      )}
    >
      <SectionHeader
        eyebrow="Stock preview"
        title={preview ? `${preview.symbol} vs the selected picks list` : "Compare before debate"}
        description={
          preview
            ? "See where the live quote stands against the current Kai list context before launching the full debate."
            : "Kai is preparing a live quote and list comparison."
        }
        icon={GitCompareArrows}
        accent="sky"
      />

      {loading ? (
        <div className="flex items-center gap-2 px-1 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading stock preview...
        </div>
      ) : null}

      {error ? <p className="px-1 py-4 text-sm text-red-500">{error}</p> : null}

      {!loading && !error && preview ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1.15fr_1fr]">
            <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Live market
                  </p>
                  <h3 className="text-lg font-semibold text-foreground">
                    {preview.quote.company_name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {preview.quote.sector || "Sector unavailable"}
                  </p>
                </div>
                <Badge variant="secondary">{preview.symbol}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                <p className="text-3xl font-semibold tracking-tight text-foreground">
                  {formatCurrency(preview.quote.price)}
                </p>
                <p
                  className={cn(
                    "text-sm font-medium",
                    (preview.quote.change_pct ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}
                >
                  {formatPercent(preview.quote.change_pct)}
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  List comparison
                </p>
                <h3 className="text-lg font-semibold text-foreground">
                  {preview.list_match.in_list ? "Included on the active list" : "Not on the active list"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {preview.list_match.in_list
                    ? preview.list_match.company_name || preview.quote.company_name
                    : "Kai does not currently match this stock to the selected picks list."}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {preview.list_match.tier ? (
                  <Badge className="bg-sky-500/10 text-sky-700 dark:text-sky-300">
                    Tier {preview.list_match.tier}
                  </Badge>
                ) : null}
                {preview.list_match.recommendation_bias ? (
                  <Badge variant="secondary">{preview.list_match.recommendation_bias}</Badge>
                ) : null}
                {preview.list_match.sector ? <Badge variant="outline">{preview.list_match.sector}</Badge> : null}
                {formatFcf(preview.list_match.fcf_billions) ? (
                  <Badge variant="outline">{formatFcf(preview.list_match.fcf_billions)}</Badge>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sky-500/15 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                {preview.list_match.in_list ? <SearchCheck className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
              </span>
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {preview.list_match.investment_thesis || "Kai can launch the full debate to generate the deeper thesis and recommendation context."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Source: {preview.list_match.label || preview.list_match.source_id} · Quote as of{" "}
                  {new Date(preview.quote.as_of || Date.now()).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="blue-gradient" effect="fill" onClick={onStartDebate}>
              Start debate
            </Button>
            {showOpenFullAnalysis ? (
              <Button variant="none" effect="fade" onClick={onOpenFullAnalysis}>
                Open full analysis
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
