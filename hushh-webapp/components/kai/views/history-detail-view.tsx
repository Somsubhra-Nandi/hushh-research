// components/kai/views/history-detail-view.tsx

/**
 * History Detail View — Renders stored analysis results using Morphy UX
 *
 * Shows a previously computed DecisionCard from an AnalysisHistoryEntry
 * WITHOUT re-triggering a live debate. Uses Morphy UX Card, Button, and
 * standard spacing conventions.
 */

"use client";

import { useMemo } from "react";
import { ArrowLeft, RefreshCw, Clock } from "lucide-react";
import { Card, CardContent } from "@/lib/morphy-ux/card";
import { Button } from "@/lib/morphy-ux/button";
import { Icon } from "@/lib/morphy-ux/ui";
import { DecisionCard, type DecisionResult } from "./decision-card";
import { RoundTabsCard } from "./round-tabs-card";
import type { AgentState } from "../debate-stream-view";
import type { AnalysisHistoryEntry } from "@/lib/services/kai-history-service";
import { useState } from "react";

// ============================================================================
// PROPS
// ============================================================================

interface HistoryDetailViewProps {
  entry: AnalysisHistoryEntry;
  onBack: () => void;
  onReanalyze: (ticker: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getDecisionColor(decision: string): string {
  switch (decision.toLowerCase()) {
    case "buy":
      return "text-emerald-400";
    case "hold":
      return "text-amber-400";
    case "reduce":
      return "text-red-400";
    default:
      return "text-zinc-400";
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function HistoryDetailView({
  entry,
  onBack,
  onReanalyze,
}: HistoryDetailViewProps) {
  // State for collapsible transcript rounds
  const [collapsedRounds, setCollapsedRounds] = useState<Record<number, boolean>>({ 1: true, 2: true });

  // Map AnalysisHistoryEntry → DecisionResult for the DecisionCard
  const decisionResult: DecisionResult = useMemo(() => {
    // raw_card contains the full DecisionResult data
    const rawCard = entry.raw_card || {};
    return {
      ticker: entry.ticker,
      decision: entry.decision,
      confidence: entry.confidence,
      consensus_reached: entry.consensus_reached,
      final_statement: entry.final_statement,
      agent_votes: entry.agent_votes,
      // Spread raw_card for enriched data (fundamental_summary, etc.)
      ...rawCard,
    };
  }, [entry]);

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      {/* Header - Masked gradient + sticky nav */}
      <div className="flex-none sticky top-0 z-10 overflow-hidden mb-4">
        {/* Root layout owns the app gradient; keep header readable with a subtle surface only. */}
        <div className="absolute inset-0 backdrop-blur-md bg-background/40" />

        {/* Content */}
        <div className="relative px-4 pt-3 pb-2 md:max-w-2xl md:mx-auto">
           {/* Breadcrumb-ish / Top Row */}
           <div className="flex items-center justify-between mb-2">
            <Button
                variant="muted"
                size="icon-sm"
                onClick={onBack}
                aria-label="Back to history"
                className="rounded-full hover:bg-background/20"
              >
                <Icon icon={ArrowLeft} size="sm" />
            </Button>
            
            <div className="flex items-center gap-2">
                 <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getDecisionColor(
                  entry.decision
                )} bg-white/5 border border-white/10`}
              >
                {entry.decision}
              </span>
            </div>
           </div>

           {/* Hero Row */}
           <div className="flex items-end justify-between px-1">
              <div>
                <h1 className="text-2xl font-black tracking-tighter text-foreground leading-none">
                  {entry.ticker}
                </h1>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1">
                   <Icon icon={Clock} size={12} className="shrink-0" />
                   <span>{formatTimestamp(entry.timestamp)}</span>
                </div>
              </div>

               <Button
                variant="gradient"
                size="sm"
                onClick={() => onReanalyze(entry.ticker)}
                className="h-8 text-xs"
              >
                <Icon icon={RefreshCw} size={12} className="mr-1.5" />
                Re-analyze
              </Button>
           </div>
        </div>
      </div>
      
      <div className="px-4 pb-safe max-w-2xl mx-auto w-full space-y-4">


      {/* Stored analysis badge */}
      <Card variant="none" effect="glass">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Icon icon={Clock} size="xs" className="text-blue-400" />
            <span className="font-sans">
              Stored result from {formatTimestamp(entry.timestamp)} — not a live analysis
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Decision Card — rendered from stored data */}
      <DecisionCard result={decisionResult} />

      {/* Debate Transcript (Static Replay) */}
      {entry.debate_transcript && (
        <div className="pt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4  delay-200">
           <div className="flex items-center gap-2 px-1">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Debate Transcript</h3>
              <div className="h-px bg-border/50 flex-1" />
           </div>
           
           <RoundTabsCard 
              roundNumber={1} 
              title="Initial Deep Analysis" 
              description="Agents analyzed raw data independently."
              isCollapsed={collapsedRounds[1] ?? true} 
              onToggleCollapse={() => setCollapsedRounds(prev => ({ ...prev, 1: !prev[1] }))}
              agentStates={entry.debate_transcript.round1 as Record<string, AgentState>}
           />
           
           {entry.debate_transcript.round2 && Object.keys(entry.debate_transcript.round2).length > 0 && (
             <RoundTabsCard 
                roundNumber={2}
                title="Strategic Debate"
                description="Agents challenged and refined positions."
                isCollapsed={collapsedRounds[2] ?? true}
                onToggleCollapse={() => setCollapsedRounds(prev => ({ ...prev, 2: !prev[2] }))}
                agentStates={entry.debate_transcript.round2 as Record<string, AgentState>}
             />
           )}
        </div>
      )}
    </div>
  </div>
  );
}
