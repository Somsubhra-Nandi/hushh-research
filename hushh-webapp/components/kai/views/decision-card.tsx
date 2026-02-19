"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/lib/morphy-ux/card";
import {
  Zap,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Scale,
  FileText,
  Link2,
  Target,
  Crown,
  Sparkles, // Use Sparkles for QUEEN if Crown is for KING
  Trophy,
  Medal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LabelList, // Added LabelList
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Icon } from "@/lib/morphy-ux/ui";

// ============================================================================
// Types
// ============================================================================

export interface DecisionResult {
  ticker: string;
  decision: "buy" | "hold" | "reduce" | string;
  confidence: number;
  consensus_reached: boolean;
  final_statement: string;
  agent_votes?: Record<string, string>;
  dissenting_opinions?: string[];
  // Enriched data
  fundamental_summary?: string;
  sentiment_summary?: string;
  valuation_summary?: string;
  raw_card?: {
    fundamental_insight?: {
      summary?: string;
      business_moat?: string;
      financial_resilience?: string;
      growth_efficiency?: string;
      bull_case?: string;
      bear_case?: string;
    };
    quant_metrics?: Record<string, any>;
    key_metrics?: {
      fundamental?: Record<string, any>;
      sentiment?: {
        sentiment_score?: number;
        catalyst_count?: number;
      };
      valuation?: Record<string, any>;
    };
    all_sources?: string[];
    risk_persona_alignment?: string;
    debate_digest?: string;
    consensus_reached?: boolean;
    dissenting_opinions?: string[];
    price_targets?: Record<string, number>;
    debate_highlights?: Array<{
      type?: string;
      agent?: string;
      content?: string;
      classification?: string;
      confidence?: number;
      magnitude?: string;
      score?: number;
      source?: string;
    }>;
    world_model_context?: {
      risk_profile?: string;
      preferences?: Record<string, unknown>;
      holdings_count?: number;
      portfolio_allocation?: Record<string, unknown>;
      has_domain_summaries?: boolean;
    };
    renaissance_context?: {
      tier?: string;
      tier_description?: string;
      conviction_weight?: number;
      investment_thesis?: string;
      fcf_billions?: number;
      sector?: string;
      sector_peers?: string[];
      recommendation_bias?: string;
      is_investable?: boolean;
      is_avoid?: boolean;
      avoid_reason?: string;
      screening_criteria?: string;
    };
    alphaagents_trace?: {
      paper?: string;
      protocol?: string;
      rounds_executed?: number;
      turns_per_agent?: number;
      consensus_method?: string;
      consensus_threshold?: number;
      consensus_reached?: boolean;
    };
    llm_synthesis?: {
      thesis?: string;
      key_drivers?: string[];
      key_risks?: string[];
      action_plan?: string[];
      watchlist_triggers?: string[];
      horizon_fit?: string;
      error?: string;
      fallback?: boolean;
    };
    // Renaissance Data (New)
    renaissance_tier?: "ACE" | "KING" | "QUEEN" | "JACK";
    renaissance_score?: number;
  };
}

// ============================================================================
// Source URL Helpers
// ============================================================================

const KNOWN_SOURCE_URLS: Record<string, string> = {
  "yahoo finance": "https://finance.yahoo.com",
  "sec edgar": "https://www.sec.gov/cgi-bin/browse-edgar",
  "google finance": "https://www.google.com/finance",
  "bloomberg": "https://www.bloomberg.com",
  "reuters": "https://www.reuters.com",
  "finnhub": "https://finnhub.io",
  "marketwatch": "https://www.marketwatch.com",
  "seeking alpha": "https://seekingalpha.com",
};

function parseSourceUrl(source: string): { text: string; url: string | null } {
  const urlMatch = source.match(/https?:\/\/[^\s)]+/);
  if (urlMatch) {
    return { text: source.replace(urlMatch[0], "").trim() || urlMatch[0], url: urlMatch[0] };
  }
  const lower = source.toLowerCase();
  for (const [key, url] of Object.entries(KNOWN_SOURCE_URLS)) {
    if (lower.includes(key)) {
      return { text: source, url };
    }
  }
  return { text: source, url: null };
}

function SourceLink({ source }: { source: string }) {
  const { text, url } = parseSourceUrl(source);
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] text-primary/80 hover:text-primary truncate pl-2 border-l-2 border-primary/20 flex items-center gap-1 transition-colors"
      >
        <Icon icon={Link2} size={10} className="shrink-0" />
        <span className="truncate">{text || url}</span>
      </a>
    );
  }
  return (
    <p className="text-[10px] text-muted-foreground truncate pl-2 border-l-2 border-primary/20">
      {text}
    </p>
  );
}

// ============================================================================
// Chart Sub-Components
// ============================================================================

const voteChartConfig = {
  score: {
    label: "Score",
    color: "hsl(var(--chart-1))",
  },
  voteBullish: {
    label: "Bullish",
    color: "hsl(var(--chart-2))",
  },
  voteNeutral: {
    label: "Neutral",
    color: "hsl(var(--chart-3))",
  },
  voteBearish: {
    label: "Bearish",
    color: "hsl(var(--chart-5))",
  },
} satisfies ChartConfig;

function AgentVoteBar({ result }: { result: DecisionResult }) {
  const votes = result.agent_votes || {};
  const entries = Object.entries(votes);
  if (entries.length === 0) return null;

  const toScore = (vote: string): number => {
    const normalized = vote.toLowerCase();
    if (normalized === "buy" || normalized === "bullish" || normalized === "undervalued") return 1;
    if (normalized === "reduce" || normalized === "sell" || normalized === "bearish") return -1;
    return 0;
  };
  const data = entries.map(([agent, vote]) => {
    const score = toScore(vote);
    return {
      agent: agent.charAt(0).toUpperCase() + agent.slice(1),
      vote: vote.toUpperCase(),
      score,
      fill:
        score > 0
          ? "var(--color-voteBullish)"
          : score < 0
          ? "var(--color-voteBearish)"
          : "var(--color-voteNeutral)",
    };
  });

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
        Agent Votes
      </p>
      <ChartContainer config={voteChartConfig} className="h-[140px] w-full">
        <BarChart accessibilityLayer data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="agent" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickMargin={10} />
          <YAxis domain={[-1, 1]} hide />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="score" radius={8}>
            {data.map((entry) => (
              <Cell key={entry.agent} fill={entry.fill} />
            ))}
            <LabelList dataKey="vote" position="top" fontSize={10} fill="hsl(var(--foreground))" />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

const consensusChartConfig = {
  agree: {
    label: "Agree",
    color: "hsl(var(--chart-2))",
  },
  dissent: {
    label: "Dissent",
    color: "hsl(var(--chart-5))",
  },
} satisfies ChartConfig;

function ConsensusDonut({ result }: { result: DecisionResult }) {
  const votes = result.agent_votes ? Object.values(result.agent_votes) : [];
  if (votes.length === 0) return null;

  const majority = result.decision.toLowerCase();
  const agreeCount = votes.filter((v) => String(v).toLowerCase() === majority).length;
  const dissentCount = votes.length - agreeCount;

  const data = [
    { name: "Agree", value: agreeCount, fill: consensusChartConfig.agree.color },
    { name: "Dissent", value: dissentCount, fill: consensusChartConfig.dissent.color },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
        Consensus
      </p>
      <ChartContainer config={consensusChartConfig} className="h-[120px] w-full">
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={48} dataKey="value" strokeWidth={0}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="flex justify-center gap-3">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: d.name === "Agree" ? consensusChartConfig.agree.color : consensusChartConfig.dissent.color }}
            />
            {d.name} ({d.value})
          </div>
        ))}
      </div>
    </div>
  );
}

const barChartConfig = {
  value: {
    label: "Value",
    color: "hsl(var(--chart-1))",
  },
  negative: {
    label: "Negative",
    color: "hsl(var(--chart-5))",
  },
  scenario: {
    label: "Scenario",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;

function QuantMetricsBarChart({ metrics }: { metrics: Record<string, any> }) {
  const data = useMemo(() => {
    return Object.entries(metrics)
      .filter(([, v]) => typeof v === "number" && v !== 0 && !Number.isNaN(v))
      .slice(0, 6)
      .map(([key, value]) => ({
        name: key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
        value: Math.abs(value as number) >= 1e9
          ? (value as number) / 1e9
          : Math.abs(value as number) >= 1e6
          ? (value as number) / 1e6
          : (value as number),
        isNegative: (value as number) < 0,
        fill: (value as number) < 0 ? "var(--color-negative)" : "var(--color-value)",
      }));
  }, [metrics]);

  if (data.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Icon icon={BarChart3} size="xs" />
        Valuation & Fundamentals
      </p>
      <ChartContainer config={barChartConfig} className="w-full h-[160px]">
        <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" hide />
          <YAxis 
            type="category" 
            dataKey="name" 
            width={110} 
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
            axisLine={false} 
            tickLine={false} 
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar 
            dataKey="value" 
            fill="var(--color-value)"
            radius={[0, 4, 4, 0]} 
            barSize={12}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
            <LabelList dataKey="value" position="right" fontSize={9} fill="hsl(var(--foreground))" formatter={(val: number) => val.toFixed(1)} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function PriceTargetsChart({ targets }: { targets: Record<string, number> }) {
  const data = Object.entries(targets)
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
    .slice(0, 4)
    .map(([key, value]) => ({
      scenario: key.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
      value: value as number,
    }));

  if (data.length < 2) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Icon icon={TrendingUp} size="xs" />
        Price Scenarios
      </p>
      <ChartContainer config={barChartConfig} className="w-full h-[160px]">
        <BarChart accessibilityLayer data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="scenario" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="value" radius={8} fill="var(--color-scenario)">
            <LabelList
              dataKey="value"
              position="top"
              fontSize={10}
              fill="hsl(var(--foreground))"
              formatter={(value: number) => `$${value.toFixed(2)}`}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// NEW: Confidence Gauge (Semi-circle Pie)
function ConfidenceGauge({ confidence }: { confidence: number }) {
  const score = Math.round(confidence * 100);
  
  const data = [
    { name: "Score", value: score, fill: "hsl(var(--primary))" },
    { name: "Max", value: 100 - score, fill: "hsl(var(--muted))" },
  ];

  return (
    <div className="relative flex flex-col items-center justify-center h-[100px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            <Cell key="score" fill="hsl(var(--primary))" />
            <Cell key="remainder" fill="hsl(var(--muted))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute bottom-0 text-center pb-2">
        <div className="text-3xl font-black tracking-tighter tabular-nums leading-none">
          {score}%
        </div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
          Confidence
        </div>
      </div>
    </div>
  );
}

// NEW: Renaissance Badge
function RenaissanceBadge({ tier, score }: { tier: "ACE" | "KING" | "QUEEN" | "JACK"; score?: number }) {
  const badgeConfig = {
    ACE: {
      color: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/30 dark:text-fuchsia-400 dark:border-fuchsia-800",
      icon: <Icon icon={Crown} size="xs" className="fill-current" />,
      label: "Renaissance Ace",
    },
    KING: {
      color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
      icon: <Icon icon={Trophy} size="xs" className="fill-current" />,
      label: "Renaissance King",
    },
    QUEEN: {
      color: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800",
      icon: <Icon icon={Sparkles} size="xs" className="fill-current" />,
      label: "Renaissance Queen",
    },
    JACK: {
      color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
      icon: <Icon icon={Medal} size="xs" className="fill-current" />,
      label: "Renaissance Jack",
    },
  };

  const config = badgeConfig[tier];

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold uppercase tracking-wider shadow-sm", config.color)}>
      {config.icon}
      {config.label}
      {score && <span className="ml-1 opacity-70">| {score.toFixed(0)}</span>}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DecisionCard({ result }: { result: DecisionResult }) {
  const [showSources, setShowSources] = useState(false);
  const isBuy = result.decision.toLowerCase() === "buy";
  const isReduce = result.decision.toLowerCase() === "reduce" || result.decision.toLowerCase() === "sell";

  const rawCard = result.raw_card;
  const sources = rawCard?.all_sources || [];
  const hasQuantMetrics = rawCard?.quant_metrics && Object.keys(rawCard.quant_metrics).filter(
    (k) => rawCard.quant_metrics![k] !== null && rawCard.quant_metrics![k] !== undefined && typeof rawCard.quant_metrics![k] !== "object"
  ).length > 0;

  // Fallback for empty/missing decision to prevent layout shift
  const safeDecision = result.decision || "HOLD";
  const safeConfidence = result.confidence || 0;
  const llmSynthesis = rawCard?.llm_synthesis;
  const synthesisDrivers = (llmSynthesis?.key_drivers || []).filter(Boolean).slice(0, 6);
  const synthesisRisks = (llmSynthesis?.key_risks || []).filter(Boolean).slice(0, 6);
  const synthesisActionPlan = (llmSynthesis?.action_plan || []).filter(Boolean).slice(0, 5);
  const synthesisTriggers = (llmSynthesis?.watchlist_triggers || []).filter(Boolean).slice(0, 6);
  const debateHighlights = (rawCard?.debate_highlights || [])
    .filter((entry) => Boolean(entry?.content))
    .slice(0, 12);
  const alphaTrace = rawCard?.alphaagents_trace;
  const renaissanceContext = rawCard?.renaissance_context;
  const worldModelContext = rawCard?.world_model_context;
  const worldModelPreferences = (worldModelContext?.preferences || {}) as Record<string, unknown>;
  const investmentHorizon =
    typeof worldModelPreferences.investment_horizon === "string"
      ? worldModelPreferences.investment_horizon
      : undefined;
  const investmentStyle =
    typeof worldModelPreferences.investment_style === "string"
      ? worldModelPreferences.investment_style
      : undefined;

  return (
    <Card
      variant="none"
      effect="glass"
      showRipple={false}
      className="border-primary/20 bg-primary/5 animate-in fade-in zoom-in duration-500 rounded-3xl overflow-hidden"
    >
      <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon={Zap} size="md" className="text-primary" />
            <CardTitle className="text-sm font-black uppercase tracking-widest">Final Recommendation</CardTitle>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
          >
            COMPLETE
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        
        {/* HERO SECTION: Decision + Badges */}
        <div className="flex flex-col items-center gap-4">
            
            {/* Renaissance Badge - Positioned prominently if exists */}
            {rawCard?.renaissance_tier && (
                <div className="animate-in fade-in slide-in-from-top-2  delay-100">
                    <RenaissanceBadge tier={rawCard.renaissance_tier} score={rawCard.renaissance_score} />
                </div>
            )}

            {/* Main Decision Pill */}
            <div
                className={cn(
                "px-10 py-5 rounded-2xl border-2 text-4xl font-black uppercase tracking-tighter shadow-xl backdrop-blur-md transform transition-all duration-300 hover:scale-[1.02]",
                isBuy
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-emerald-500/10"
                    : isReduce
                    ? "bg-red-500/10 border-red-500/20 text-red-500 shadow-red-500/10"
                    : "bg-blue-500/10 border-blue-500/20 text-blue-500 shadow-blue-500/10"
                )}
            >
                {safeDecision}
            </div>

            {/* Confidence Gauge - Replacing Linear Progress */}
            <ConfidenceGauge confidence={safeConfidence} />
        </div>

        <Separator className="bg-primary/10" />

        {/* DATA VISUALIZATION GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AgentVoteBar result={result} />
          {rawCard?.price_targets && Object.keys(rawCard.price_targets).length > 1 ? (
               <PriceTargetsChart targets={rawCard.price_targets} />
          ) : hasQuantMetrics && rawCard?.quant_metrics ? (
               <QuantMetricsBarChart metrics={rawCard.quant_metrics} />
          ) : (
               <ConsensusDonut result={result} />
          )}
        </div>

        {/* KEY INSIGHTS SECTION */}
        <div className="space-y-3">
            {/* Risk Persona Alignment */}
            {rawCard?.risk_persona_alignment && (
            <div className="p-4 bg-background/50 border border-primary/10 rounded-2xl backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                <Icon icon={Shield} size="sm" className="text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wide">Risk Alignment</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{rawCard.risk_persona_alignment}</p>
            </div>
            )}

            {/* Key Takeaway - Highlight the most important insight */}
            {rawCard?.fundamental_insight?.summary && (
            <div className="p-5 bg-linear-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Icon icon={Zap} size={96} className="rotate-12" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                    <Icon icon={Zap} size="sm" className="text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-primary">Key Takeaway</span>
                    </div>
                    <p className="text-sm font-semibold leading-relaxed text-foreground/90">{rawCard.fundamental_insight.summary}</p>
                </div>
            </div>
            )}
        </div>

        {/* SECONDARY METRICS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Business Moat */}
            {rawCard?.fundamental_insight?.business_moat && (
            <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                <Icon icon={Shield} size="xs" className="text-blue-500" />
                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Moat</span>
                </div>
                <p className="text-xs text-muted-foreground">{rawCard.fundamental_insight.business_moat}</p>
            </div>
            )}
            
            {/* Sentiment Gauge Card */}
            {rawCard?.key_metrics?.sentiment?.sentiment_score !== undefined && (
            <div className="p-4 bg-card/40 border border-border/50 rounded-2xl flex flex-col justify-center">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Icon icon={BarChart3} size="xs" style={{ color: "hsl(var(--chart-3))" }} />
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "hsl(var(--chart-3))" }}>Sentiment</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono bg-muted/30 border-border/40">
                        {(rawCard.key_metrics.sentiment.sentiment_score * 100).toFixed(0)}%
                    </Badge>
                </div>
                <Progress value={(rawCard.key_metrics.sentiment.sentiment_score + 1) * 50} className="h-1.5 mb-2" />
                <p className="text-[10px] text-muted-foreground text-center font-medium">
                {rawCard.key_metrics.sentiment.sentiment_score > 0.3 ? "Bullish" : rawCard.key_metrics.sentiment.sentiment_score < -0.3 ? "Bearish" : "Neutral"}
                </p>
            </div>
            )}
        </div>

        {/* BULL / BEAR TOGGLES */}
        {(rawCard?.fundamental_insight?.bull_case || rawCard?.fundamental_insight?.bear_case) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rawCard.fundamental_insight.bull_case && (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                    <Icon icon={TrendingUp} size="xs" className="text-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Bull Case</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{rawCard.fundamental_insight.bull_case}</p>
                </div>
            )}
            {rawCard.fundamental_insight.bear_case && (
                <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                    <Icon icon={TrendingDown} size="xs" className="text-red-500" />
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Bear Case</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{rawCard.fundamental_insight.bear_case}</p>
                </div>
            )}
            </div>
        )}

        {/* FINANCIAL RESILIENCE & GROWTH */}
        {(rawCard?.fundamental_insight?.financial_resilience || rawCard?.fundamental_insight?.growth_efficiency) && (
          <div className="grid grid-cols-2 gap-3">
            {rawCard.fundamental_insight.financial_resilience && (
              <div className="p-3 bg-card/40 rounded-xl border border-border/40">
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1 font-bold">Resilience</p>
                <p className="text-xs font-medium">{rawCard.fundamental_insight.financial_resilience}</p>
              </div>
            )}
            {rawCard.fundamental_insight.growth_efficiency && (
              <div className="p-3 bg-card/40 rounded-xl border border-border/40">
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1 font-bold">Growth Eff.</p>
                <p className="text-xs font-medium">{rawCard.fundamental_insight.growth_efficiency}</p>
              </div>
            )}
          </div>
        )}

        {/* FINAL STATEMENT */}
        <div className="p-5 bg-card/60 rounded-2xl border border-border/60">
            <div className="flex items-center gap-2 mb-2 opacity-50">
                <Icon icon={FileText} size="xs" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Verdict Rationale</span>
            </div>
            <p className="text-sm font-medium leading-relaxed">{rawCard?.debate_digest || result.final_statement}</p>
        </div>

        {/* LLM SYNTHESIS */}
        {(llmSynthesis?.thesis || llmSynthesis?.horizon_fit || llmSynthesis?.error) && (
          <div className="p-5 bg-primary/5 border border-primary/20 rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                <Icon icon={Sparkles} size="xs" />
                Chief Strategist Synthesis
              </p>
              {llmSynthesis?.fallback && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                  Deterministic
                </Badge>
              )}
            </div>
            {llmSynthesis?.thesis && (
              <p className="text-sm leading-relaxed text-foreground/90">{llmSynthesis.thesis}</p>
            )}
            {llmSynthesis?.horizon_fit && (
              <div className="p-3 rounded-xl border border-primary/20 bg-background/50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  Horizon Fit
                </p>
                <p className="text-xs text-foreground/80">{llmSynthesis.horizon_fit}</p>
              </div>
            )}
            {llmSynthesis?.error && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Synthesis warning: {llmSynthesis.error}
              </p>
            )}
          </div>
        )}

        {/* DRIVERS + RISKS */}
        {(synthesisDrivers.length > 0 || synthesisRisks.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {synthesisDrivers.length > 0 && (
              <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                  <Icon icon={TrendingUp} size="xs" />
                  Key Drivers
                </p>
                <ul className="space-y-2">
                  {synthesisDrivers.map((driver, idx) => (
                    <li
                      key={`${driver}-${idx}`}
                      className="text-xs text-muted-foreground pl-3 border-l-2 border-emerald-500/30"
                    >
                      {driver}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {synthesisRisks.length > 0 && (
              <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                  <Icon icon={Shield} size="xs" />
                  Key Risks
                </p>
                <ul className="space-y-2">
                  {synthesisRisks.map((risk, idx) => (
                    <li
                      key={`${risk}-${idx}`}
                      className="text-xs text-muted-foreground pl-3 border-l-2 border-red-500/30"
                    >
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ACTION PLAN + WATCHLIST */}
        {(synthesisActionPlan.length > 0 || synthesisTriggers.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {synthesisActionPlan.length > 0 && (
              <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                  <Icon icon={Target} size="xs" />
                  Action Plan
                </p>
                <ul className="space-y-2">
                  {synthesisActionPlan.map((step, idx) => (
                    <li
                      key={`${step}-${idx}`}
                      className="text-xs text-muted-foreground pl-3 border-l-2 border-blue-500/30"
                    >
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {synthesisTriggers.length > 0 && (
              <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                  <Icon icon={Zap} size="xs" />
                  Watchlist Triggers
                </p>
                <ul className="space-y-2">
                  {synthesisTriggers.map((trigger, idx) => (
                    <li
                      key={`${trigger}-${idx}`}
                      className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-500/30"
                    >
                      {trigger}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* CONTEXT + PROTOCOL TRACE */}
        {(worldModelContext || renaissanceContext || alphaTrace) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {worldModelContext && (
              <div className="p-4 bg-card/50 rounded-2xl border border-border/50 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  World Model Context
                </p>
                <p className="text-xs text-muted-foreground">
                  Risk: {String(worldModelContext.risk_profile || "balanced")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Holdings: {worldModelContext.holdings_count ?? 0}
                </p>
                {investmentHorizon && (
                  <p className="text-xs text-muted-foreground">Horizon: {investmentHorizon}</p>
                )}
                {investmentStyle && (
                  <p className="text-xs text-muted-foreground">Style: {investmentStyle}</p>
                )}
              </div>
            )}
            {renaissanceContext && (
              <div className="p-4 bg-card/50 rounded-2xl border border-border/50 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Renaissance Context
                </p>
                <p className="text-xs">
                  Tier: <span className="font-semibold">{renaissanceContext.tier || "N/A"}</span>
                  {renaissanceContext.recommendation_bias
                    ? ` (${renaissanceContext.recommendation_bias})`
                    : ""}
                </p>
                {typeof renaissanceContext.conviction_weight === "number" && (
                  <p className="text-xs text-muted-foreground">
                    Conviction: {(renaissanceContext.conviction_weight * 100).toFixed(0)}%
                  </p>
                )}
                {renaissanceContext.investment_thesis && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {renaissanceContext.investment_thesis}
                  </p>
                )}
              </div>
            )}
            {alphaTrace && (
              <div className="p-4 bg-card/50 rounded-2xl border border-border/50 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  AlphaAgents Protocol
                </p>
                <p className="text-xs text-muted-foreground">
                  Paper: {alphaTrace.paper || "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Rounds: {alphaTrace.rounds_executed ?? 0} | Turns/Agent:{" "}
                  {alphaTrace.turns_per_agent ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Consensus Method: {alphaTrace.consensus_method || "weighted_vote"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* DEBATE HIGHLIGHTS */}
        {debateHighlights.length > 0 && (
          <div className="p-4 bg-card/40 rounded-2xl border border-border/40 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Debate Highlights
            </p>
            <div className="max-h-56 overflow-y-auto pr-1 space-y-2">
              {debateHighlights.map((entry, idx) => (
                <div key={`${entry.agent}-${idx}`} className="p-2 rounded-lg border border-border/40 bg-background/40">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {entry.agent || "agent"}
                    </Badge>
                    {entry.type && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {entry.type.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{entry.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deep Analysis section intentionally removed: debate rounds already surface the agent detail. */}
        
        {/* Consensus Donut - Only show here if QuantMetrics took the main spot */}
        {hasQuantMetrics && rawCard?.quant_metrics && (
             <div className="pt-2">
                <Separator className="bg-primary/5 mb-4" />
                <ConsensusDonut result={result} />
             </div>
        )}

        {/* DISSENT */}
        {result.dissenting_opinions && result.dissenting_opinions.length > 0 && (
          <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
              <Icon icon={Scale} size="xs" />
              Dissenting Opinions
            </p>
            <ul className="space-y-2">
              {result.dissenting_opinions.map((opinion, idx) => (
                <li key={idx} className="text-xs text-muted-foreground pl-3 border-l-2 border-amber-500/30">
                  {opinion}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SOURCES */}
        {sources.length > 0 && (
          <>
            <Separator className="opacity-30" />
            <div>
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors duration-200"
              >
                <Icon icon={ExternalLink} size="xs" />
                Sources ({sources.length})
                {showSources ? (
                  <Icon icon={ChevronUp} size={12} />
                ) : (
                  <Icon icon={ChevronDown} size={12} />
                )}
              </button>
              {showSources && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sources.map((src, i) => (
                    <SourceLink key={i} source={src} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* DISCLAIMER */}
        <div className="pt-4">
          <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed max-w-xs mx-auto">
            Agent Kai is an educational tool and does not constitute investment advice. Always consult a qualified
            financial advisor.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
