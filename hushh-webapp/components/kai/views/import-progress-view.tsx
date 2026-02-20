/**
 * ImportProgressView Component
 *
 * Real-time streaming progress UI for portfolio import.
 * Displays Gemini AI extraction progress with thinking mode support.
 *
 * Features:
 * - Animated progress bar for stream progression
 * - Real-time thought summaries from Gemini thinking mode (in StreamingAccordion)
 * - Parsing timeline surface (indexing/scanning/extracting/parsing/validation)
 * - Character count and chunk count stats
 * - Cancel button
 * - Auto-collapsing accordions when streaming completes
 */

"use client";

import { useMemo } from "react";
import { cn } from "@/lib/morphy-ux";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/lib/morphy-ux/card";
import { Progress } from "@/components/ui/progress";
import { Button as MorphyButton } from "@/lib/morphy-ux/button";
import { X, FileChartColumn, CheckCircle2 } from "lucide-react";
import { Icon } from "@/lib/morphy-ux/ui";
import { useSmoothStreamProgress } from "@/lib/morphy-ux/hooks/use-smooth-stream-progress";


export type ImportStage =
  | "idle"
  | "uploading"
  | "indexing"
  | "scanning"
  | "thinking"
  | "extracting"
  | "parsing"
  | "complete"
  | "error";

interface QualityReport {
  raw?: number;
  validated?: number;
  dropped?: number;
  reconciled?: number;
  mismatch_detected?: number;
}

interface LiveHoldingPreview {
  symbol?: string;
  name?: string;
  market_value?: number | null;
  quantity?: number | null;
  asset_type?: string;
}

export interface ImportProgressViewProps {
  /** Current processing stage */
  stage: ImportStage;
  /** Streamed text from backend stream (used for stats/phase awareness) */
  streamedText: string;
  /** Whether actively streaming */
  isStreaming: boolean;
  /** Total characters received */
  totalChars: number;
  /** Total chunks received */
  chunkCount: number;
  /** Stream progress percentage from backend canonical payload */
  progressPct?: number;
  /** Optional status message from backend payload */
  statusMessage?: string;
  /** Ordered stage/status trail captured during stream */
  stageTrail?: string[];
  /** Array of thought summaries from Gemini thinking mode */
  thoughts?: string[];
  /** Total thought count */
  thoughtCount?: number;
  /** Quality reconciliation summary from backend parser */
  qualityReport?: QualityReport;
  /** Incremental parsed holdings preview */
  liveHoldings?: LiveHoldingPreview[];
  /** Parsed holdings count so far */
  holdingsExtracted?: number;
  /** Total holdings expected */
  holdingsTotal?: number;
  /** Error message if stage is 'error' */
  errorMessage?: string;
  /** Cancel handler */
  onCancel?: () => void;
  /** Continue from completed import to review screen */
  onContinue?: () => void;
  /** Return to dashboard after completed import */
  onBackToDashboard?: () => void;
  /** Additional CSS classes */
  className?: string;
}

const stageMessages: Record<ImportStage, string> = {
  idle: "Ready to import",
  uploading: "Processing uploaded file...",
  indexing: "Indexing document...",
  scanning: "Scanning pages and sections...",
  thinking: "AI reasoning about your portfolio...",
  extracting: "Extracting financial data...",
  parsing: "Processing extracted data...",
  complete: "Import complete!",
  error: "Import failed",
};

const TIMELINE_STEPS: Array<{
  key: "indexing" | "scanning" | "extracting" | "parsing" | "complete";
  label: string;
}> = [
  { key: "indexing", label: "Indexing document" },
  { key: "scanning", label: "Scanning pages" },
  { key: "extracting", label: "Extracting positions" },
  { key: "parsing", label: "Normalizing holdings" },
  { key: "complete", label: "Validation complete" },
];

const STAGE_ORDER: Record<ImportStage, number> = {
  idle: 0,
  uploading: 1,
  indexing: 2,
  scanning: 3,
  thinking: 4,
  extracting: 5,
  parsing: 6,
  complete: 7,
  error: 7,
};

export function ImportProgressView({
  stage,
  streamedText,
  isStreaming,
  totalChars,
  chunkCount,
  progressPct,
  statusMessage,
  stageTrail = [],
  thoughts = [],
  thoughtCount = 0,
  qualityReport,
  liveHoldings = [],
  holdingsExtracted = 0,
  holdingsTotal,
  errorMessage,
  onCancel,
  onContinue,
  onBackToDashboard,
  className,
}: ImportProgressViewProps) {
  // Determine if we're in a thinking or extracting phase
  const isThinking = stage === "thinking";
  const isExtracting = stage === "extracting" || stage === "parsing";
  const isComplete = stage === "complete";
  const hasStreamedOutput = streamedText.trim().length > 0;
  const resolvedProgress = useMemo(() => {
    if (typeof progressPct === "number" && Number.isFinite(progressPct)) {
      return Math.max(0, Math.min(100, progressPct));
    }
    switch (stage) {
      case "uploading":
        return 5;
      case "indexing":
        return 18;
      case "scanning":
        return 35;
      case "thinking":
        return 52;
      case "extracting":
        return 72;
      case "parsing":
        return 90;
      case "complete":
        return 100;
      case "error":
        return 100;
      default:
        return 0;
    }
  }, [progressPct, stage]);
  const smoothProgress = useSmoothStreamProgress(resolvedProgress);

  // Format thoughts into a single text string for the accordion
  const stageLines = useMemo(() => {
    if (stageTrail.length > 0) {
      return stageTrail;
    }
    return [statusMessage || stageMessages[stage]];
  }, [stageTrail, stage, statusMessage]);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon icon={FileChartColumn} size="md" className={cn(isStreaming && "text-primary")} />
            <CardTitle className="text-lg">Importing Portfolio</CardTitle>
          </div>
          {onCancel && stage !== "complete" && (
            <MorphyButton
              variant="muted"
              size="sm"
              onClick={onCancel}
              className="h-8 rounded-lg"
              icon={{ icon: X }}
            >
              Back to Dashboard
            </MorphyButton>
          )}

        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stream Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Import progress</span>
            <span>{Math.round(smoothProgress)}%</span>
          </div>
          <Progress
            value={smoothProgress}
            className={cn("h-2", isStreaming && "transition-all")}
          />
        </div>

        {/* Status Message */}
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {statusMessage || stageMessages[stage]}
          </p>
        </div>


        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>AI Stream Transcript</span>
            <span>
              {isStreaming ? "Live" : isComplete ? "Complete" : "Idle"}
            </span>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            <div className="rounded-lg border border-border/40 bg-background/70 px-3 py-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Stage timeline
              </p>
              <div className="space-y-1">
                {stageLines.map((line, index) => (
                  <p key={`${line}-${index}`} className="text-xs leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/40 bg-background/70 px-3 py-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reasoning ({thoughtCount})
              </p>
              {thoughts.length > 0 ? (
                <div className="space-y-1">
                  {thoughts.map((thought, index) => (
                    <p key={`${thought}-${index}`} className="text-xs leading-relaxed">
                      {index + 1}. {thought}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {isThinking
                    ? "Model is preparing reasoning output..."
                    : "No explicit reasoning tokens emitted yet."}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border/40 bg-background/70 px-3 py-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Vertex Gemini token stream
              </p>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                {streamedText.trim().length > 0
                  ? streamedText
                  : isStreaming
                  ? "Waiting for first response tokens..."
                  : "No streamed tokens captured."}
              </pre>
            </div>
          </div>
        </div>

        {/* Parsing timeline */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Parsing Timeline</span>
            <span>
              {Math.round(smoothProgress)}%
            </span>
          </div>
          <div className="space-y-2">
            {TIMELINE_STEPS.map((timelineStep) => {
              const timelineStage: ImportStage = stage === "thinking" ? "scanning" : stage;
              const currentOrder = STAGE_ORDER[timelineStage];
              const stepOrder = STAGE_ORDER[timelineStep.key];
              const done = currentOrder > stepOrder;
              const active = !done && currentOrder === stepOrder;
              return (
                <div
                  key={timelineStep.key}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-background/70 px-3 py-2"
                >
                  <span className="text-xs font-medium">{timelineStep.label}</span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide",
                      done && "text-emerald-600 dark:text-emerald-400",
                      active && "text-primary",
                      !done && !active && "text-muted-foreground"
                    )}
                  >
                    {done ? "Done" : active ? "Active" : "Pending"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {(hasStreamedOutput || totalChars > 0 || chunkCount > 0) && (
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <span>Streaming stats</span>
            <span>
              {totalChars.toLocaleString()} chars • {chunkCount} chunks
            </span>
          </div>
        )}

        {/* Parsed holdings preview while parsing */}
        {(holdingsExtracted > 0 || liveHoldings.length > 0) && (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Extracted Holdings</span>
              <span>
                {holdingsExtracted}
                {typeof holdingsTotal === "number" && holdingsTotal > 0 ? ` / ${holdingsTotal}` : ""}
              </span>
            </div>
            <div className="max-h-80 overflow-y-auto pr-1 space-y-1.5">
              {liveHoldings.map((holding, idx) => (
                  <div
                    key={`${holding.symbol || holding.name || "holding"}-${idx}`}
                    className="rounded-lg border border-border/40 bg-background/70 px-2.5 py-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground/90 truncate">
                          {holding.symbol || `Holding ${idx + 1}`}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {holding.name || "Security captured from statement"}
                        </p>
                      </div>
                      {holding.asset_type && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border/50 rounded px-1.5 py-0.5">
                          {holding.asset_type}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Qty:{" "}
                        {typeof holding.quantity === "number"
                          ? holding.quantity.toLocaleString()
                          : "—"}
                      </span>
                      <span>
                        Value:{" "}
                        {typeof holding.market_value === "number"
                          ? `$${holding.market_value.toLocaleString()}`
                          : "—"}
                      </span>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Display */}
        {stage === "error" && errorMessage && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-sm text-red-500">{errorMessage}</p>
          </div>
        )}

        {/* Complete State */}
        {stage === "complete" && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="flex items-center gap-2">
              <Icon icon={CheckCircle2} size="md" className="text-emerald-500" />
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                Successfully extracted portfolio data
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalChars.toLocaleString()} characters processed
              {thoughtCount > 0 && ` • ${thoughtCount} AI reasoning steps`}
            </p>
            {qualityReport && (
              <p className="text-xs text-muted-foreground mt-1">
                Validated {qualityReport.validated ?? 0}
                {qualityReport.reconciled !== undefined
                  ? ` • Reconciled ${qualityReport.reconciled}`
                  : ""}
                {qualityReport.dropped !== undefined ? ` • Dropped ${qualityReport.dropped}` : ""}
                {qualityReport.mismatch_detected !== undefined
                  ? ` • Mismatches ${qualityReport.mismatch_detected}`
                  : ""}
              </p>
            )}
            {onContinue && (
              <MorphyButton
                variant="gradient"
                size="sm"
                className="mt-3"
                onClick={onContinue}
              >
                Review Extracted Portfolio
              </MorphyButton>
            )}
            {onBackToDashboard && (
              <MorphyButton
                variant="muted"
                size="sm"
                className="mt-2 ml-2"
                onClick={onBackToDashboard}
              >
                Back to Dashboard
              </MorphyButton>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
