"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/lib/morphy-ux/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertCircle, RefreshCw, X, WifiOff, ShieldAlert, Clock, CheckCircle2 } from "lucide-react";
import { Icon } from "@/lib/morphy-ux/ui";
import { setKaiVaultOwnerToken } from "@/lib/services/kai-service";
import { KaiHistoryService } from "@/lib/services/kai-history-service";
import { CacheService, CACHE_KEYS } from "@/lib/services/cache-service";
import { DecisionCard } from "./views/decision-card";
import { RoundTabsCard } from "./views/round-tabs-card";
import { toast } from "sonner";
import { Card, CardContent } from "@/lib/morphy-ux/card";
import { HushhLoader } from "@/components/ui/hushh-loader";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ApiService } from "@/lib/services/api-service";
import { consumeCanonicalKaiStream } from "@/lib/streaming/kai-stream-client";
import type { KaiStreamEnvelope } from "@/lib/streaming/kai-stream-types";
import { useKaiSession } from "@/lib/stores/kai-session-store";
import { KaiProfileService } from "@/lib/services/kai-profile-service";

// ============================================================================
// Types
// ============================================================================

export interface AgentState {
  stage: "idle" | "active" | "complete" | "error";
  text: string;
  thoughts: string[];
  error?: string;
  // Rich data from agent_complete
  recommendation?: string;
  confidence?: number;
  metrics?: Record<string, any>;
  sources?: string[];
  // Fundamental-specific
  keyMetrics?: Record<string, any>;
  quantMetrics?: Record<string, any>;
  businessMoat?: string;
  financialResilience?: string;
  growthEfficiency?: string;
  bullCase?: string;
  bearCase?: string;
  // Sentiment-specific
  sentimentScore?: number;
  keyCatalysts?: string[];
  // Valuation-specific
  valuationMetrics?: Record<string, any>;
  peerComparison?: Record<string, any>;
  priceTargets?: Record<string, any>;
}

export interface Insight {
  type: "claim" | "evidence" | "impact" | "bull_case_personalized" | "bear_case_personalized" | "renaissance_verdict";
  id?: string;
  agent: string;
  content: string;
  // Specific fields
  classification?: string; // fact/projection/risk/opportunity
  confidence?: number;
  source?: string;
  magnitude?: string;
  score?: number;
  target_claim_id?: string;
  timestamp: string;
}

const INITIAL_AGENT_STATE: AgentState = {
  stage: "idle",
  text: "",
  thoughts: [],
};

const INITIAL_ROUND_STATE: Record<string, AgentState> = {
  fundamental: { ...INITIAL_AGENT_STATE },
  sentiment: { ...INITIAL_AGENT_STATE },
  valuation: { ...INITIAL_AGENT_STATE },
};

// ============================================================================
// Error Classification
// ============================================================================

type ErrorType = "rate_limit" | "auth_expired" | "server_error" | "connection_lost" | "unknown";

function classifyError(status: number | null, message: string): ErrorType {
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth_expired";
  if (status && status >= 500) return "server_error";
  if (message.includes("fetch") || message.includes("network") || message.includes("abort")) return "connection_lost";
  return "unknown";
}

function getErrorDisplay(errorType: ErrorType, retryIn?: number): { icon: React.ReactNode; title: string; message: string } {
  switch (errorType) {
    case "rate_limit":
      return {
        icon: <Icon icon={Clock} size={32} className="text-amber-500" />,
        title: "Rate Limit Reached",
        message: retryIn ? `Too many requests. Retrying in ${retryIn}s...` : "Too many requests. Please try again in a moment.",
      };
    case "auth_expired":
      return {
        icon: <Icon icon={ShieldAlert} size={32} className="text-red-500" />,
        title: "Session Expired",
        message: "Your session has expired. Please re-authenticate to continue.",
      };
    case "server_error":
      return {
        icon: <Icon icon={AlertCircle} size={32} className="text-red-500" />,
        title: "Server Error",
        message: retryIn ? `Server encountered an error. Retrying in ${retryIn}s...` : "Server error. Please try again.",
      };
    case "connection_lost":
      return {
        icon: <Icon icon={WifiOff} size={32} className="text-orange-500" />,
        title: "Connection Lost",
        message: "Lost connection to the analysis server.",
      };
    default:
      return {
        icon: <Icon icon={AlertCircle} size={32} className="text-red-500" />,
        title: "Analysis Interrupted",
        message: "An unexpected error occurred.",
      };
  }
}

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000]; // Exponential backoff

// ============================================================================
// Component
// ============================================================================

interface DebateStreamViewProps {
  ticker: string;
  userId: string;
  riskProfile?: string;
  vaultOwnerToken: string;
  vaultKey?: string;
  onClose: () => void;
}

export function DebateStreamView({ ticker, userId, riskProfile: riskProfileProp, vaultOwnerToken, vaultKey, onClose }: DebateStreamViewProps) {
  const setBusyOperation = useKaiSession((s) => s.setBusyOperation);
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ErrorType>("unknown");
  const [kaiThinking, setKaiThinking] = useState<string>("Initializing...");
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Rounds
  const [activeRound, setActiveRound] = useState<1 | 2>(1);
  const activeRoundRef = useRef<1 | 2>(1);
  const [round1States, setRound1States] = useState<Record<string, AgentState>>(
    JSON.parse(JSON.stringify(INITIAL_ROUND_STATE))
  );
  const [round2States, setRound2States] = useState<Record<string, AgentState>>(
    JSON.parse(JSON.stringify(INITIAL_ROUND_STATE))
  );

  // Live Insights State
  const [_insights, setInsights] = useState<Insight[]>([]);
  const insightsRef = useRef<Insight[]>([]); // Ref for stream safety

  // Refs for robust state tracking inside async stream
  const round1StatesRef = useRef<Record<string, AgentState>>(JSON.parse(JSON.stringify(INITIAL_ROUND_STATE)));
  const round2StatesRef = useRef<Record<string, AgentState>>(JSON.parse(JSON.stringify(INITIAL_ROUND_STATE)));

  // UI Control
  const [activeAgent, setActiveAgent] = useState("fundamental");
  const [collapsedRounds, setCollapsedRounds] = useState<Record<number, boolean>>({ 1: false, 2: true });

  const [decision, setDecision] = useState<any>(null);

  // ---- Overall progress computation ----
  const AGENTS = ["fundamental", "sentiment", "valuation"] as const;

  const overallProgress = useMemo(() => {
    let progress = 0;
    // Round 1: each agent complete = +14%, active/streaming = +7%
    for (const agent of AGENTS) {
      const s = round1States[agent]?.stage;
      if (s === "complete") progress += 14;
      else if (s === "active") progress += 7;
    }
    // Round 2: same weighting
    for (const agent of AGENTS) {
      const s = round2States[agent]?.stage;
      if (s === "complete") progress += 14;
      else if (s === "active") progress += 7;
    }
    // Decision phase bump
    if (decision) progress = 100;
    else if (activeRound > 1 && round2States.valuation?.stage === "complete") {
      progress = Math.max(progress, 90); // awaiting decision
    }
    return Math.min(progress, 100);
  }, [round1States, round2States, decision, activeRound]);

  const progressLabel = useMemo(() => {
    if (decision) return "Analysis complete";
    const agentLabels: Record<string, string> = {
      fundamental: "Fundamental",
      sentiment: "Sentiment",
      valuation: "Valuation",
    };
    // Find the currently active agent
    const states = activeRound === 1 ? round1States : round2States;
    for (const agent of AGENTS) {
      if (states[agent]?.stage === "active") {
        return `Round ${activeRound} — ${agentLabels[agent]} Agent`;
      }
    }
    // If no agent is active, check if all are complete
    const allComplete = AGENTS.every((a) => states[a]?.stage === "complete");
    if (allComplete && activeRound === 1) return "Round 1 complete — transitioning…";
    if (allComplete && activeRound === 2) return "Forming consensus…";
    return `Round ${activeRound} — Analyzing…`;
  }, [round1States, round2States, activeRound, decision]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Helper to update specific agent state in current round
  const updateAgentState = useCallback((round: 1 | 2, agent: string, update: Partial<AgentState>) => {
    // Update Ref (Source of Truth for Stream)
    const ref = round === 1 ? round1StatesRef : round2StatesRef;
    if (ref.current[agent]) {
       ref.current[agent] = { ...ref.current[agent], ...update };
    }

    // Update React State
    const setter = round === 1 ? setRound1States : setRound2States;
    setter((prev) => {
      const currentState = prev[agent];
      if (!currentState) return prev;
      return {
        ...prev,
        [agent]: { ...currentState, ...update },
      };
    });
  }, []);

  // Handle close - ensuring ABORT
  const handleClose = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
    setBusyOperation("stock_analysis_stream", false);
    onClose();
  }, [onClose, setBusyOperation]);

  // Reset state for retry
  const resetState = useCallback(() => {
    setLoading(true);
    setError(null);
    setErrorType("unknown");
    setKaiThinking("Initializing...");
    activeRoundRef.current = 1;
    setActiveRound(1);
    setRound1States(JSON.parse(JSON.stringify(INITIAL_ROUND_STATE)));
    setRound2States(JSON.parse(JSON.stringify(INITIAL_ROUND_STATE)));
    setActiveAgent("fundamental");
    setCollapsedRounds({ 1: false, 2: true });
    setActiveAgent("fundamental");
    setCollapsedRounds({ 1: false, 2: true });
    setDecision(null);
    setInsights([]);
    setRetryCountdown(null);
    // Reset refs
    round1StatesRef.current = JSON.parse(JSON.stringify(INITIAL_ROUND_STATE));
    round2StatesRef.current = JSON.parse(JSON.stringify(INITIAL_ROUND_STATE));
  }, []);

  // Start stream with retry logic
  const startStream = useCallback(
    async (isRetry = false) => {
      if (!isRetry && hasStartedRef.current) return;
      hasStartedRef.current = true;

      // Ensure token is set for service layer
      if (vaultOwnerToken) {
        setKaiVaultOwnerToken(vaultOwnerToken);
      }

      try {
        if (!isRetry) {
          setLoading(true);
          setError(null);
        }
        setBusyOperation("stock_analysis_stream", true);
        abortControllerRef.current = new AbortController();

        // Build user context payload for backend personalization.
        let context: Record<string, unknown> | null = null;
        let effectiveRiskProfile = riskProfileProp || "balanced";
        if (vaultKey) {
          try {
            const profile = await KaiProfileService.getProfile({
              userId,
              vaultKey,
              vaultOwnerToken,
            });
            effectiveRiskProfile =
              (profile.preferences.risk_profile as unknown as string | null) ||
              effectiveRiskProfile;
            context = {
              user_name: userId,
              preferences: {
                investment_horizon: profile.preferences.investment_horizon,
                investment_horizon_selected_at:
                  profile.preferences.investment_horizon_selected_at,
                investment_horizon_anchor_at:
                  profile.preferences.investment_horizon_anchor_at,
                drawdown_response: profile.preferences.drawdown_response,
                drawdown_response_selected_at:
                  profile.preferences.drawdown_response_selected_at,
                volatility_preference: profile.preferences.volatility_preference,
                volatility_preference_selected_at:
                  profile.preferences.volatility_preference_selected_at,
                risk_score: profile.preferences.risk_score,
                risk_profile: profile.preferences.risk_profile,
                risk_profile_selected_at:
                  profile.preferences.risk_profile_selected_at,
              },
              kai_profile: profile,
            };
          } catch (err) {
            console.warn("[DebateStreamView] Failed to load Kai profile context:", err);
            // Non-fatal, proceed without context
          }
        }

        // Start SSE connection via ApiService.
        // This centralizes Android localhost→10.0.2.2 normalization and
        // uses native plugins on iOS/Android when available.
        const response = await ApiService.streamKaiAnalysis({
          userId,
          ticker,
          riskProfile: effectiveRiskProfile,
          userContext: context, // Pass the FULL decrypted context object
          vaultOwnerToken,
          signal: abortControllerRef.current.signal,
        });

        // If the user closes/back while the native plugin is still streaming,
        // we still abort UI processing; plugin continues but listener cleanup
        // is handled within ApiService.
        if (abortControllerRef.current.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        if (!response.ok) {
          const status = response.status;
          const errType = classifyError(status, "");

          // Auto-retry for retryable errors
          if ((errType === "rate_limit" || errType === "server_error") && retryCountRef.current < MAX_RETRIES) {
            const delay = RETRY_DELAYS[retryCountRef.current] || 8000;
            retryCountRef.current++;
            const seconds = Math.ceil(delay / 1000);
            setRetryCountdown(seconds);
            setErrorType(errType);
            setKaiThinking(`${errType === "rate_limit" ? "Rate limited" : "Server error"}. Retrying in ${seconds}s...`);

            // Countdown timer
            let countdown = seconds;
            const countdownInterval = setInterval(() => {
              countdown--;
              setRetryCountdown(countdown);
              if (countdown <= 0) {
                clearInterval(countdownInterval);
              }
            }, 1000);

            retryTimerRef.current = setTimeout(() => {
              clearInterval(countdownInterval);
              setRetryCountdown(null);
              startStream(true);
            }, delay);
            return;
          }

          throw new Error(`API error: ${status}`);
        }

        // Reset retry count on successful connection
        retryCountRef.current = 0;
        setLoading(false);
        setRetryCountdown(null);

        const resolveRound = (data: Record<string, any>): 1 | 2 => {
          if (data.round === 2 || data.round === "2") return 2;
          if (data.round === 1 || data.round === "1") return 1;
          const phase = typeof data.phase === "string" ? data.phase.toLowerCase() : "";
          if (phase === "debate" || phase === "round2" || phase === "decision") return 2;
          if (phase === "analysis" || phase === "round1") return 1;
          return activeRoundRef.current;
        };

        await consumeCanonicalKaiStream(
          response,
          (envelope: KaiStreamEnvelope) => {
            const resolvedEventType = envelope.event;
            const data = envelope.payload as Record<string, any>;

            switch (resolvedEventType) {
              case "start": {
                const message =
                  (typeof data.message === "string" && data.message) ||
                  (typeof data.text === "string" ? data.text : "");
                if (message) {
                  setKaiThinking(message);
                }
                break;
              }
              case "warning": {
                const message =
                  (typeof data.message === "string" && data.message) ||
                  (typeof data.code === "string" ? data.code : "Streaming warning");
                if (message) {
                  setKaiThinking(message);
                  toast.warning("Streaming warning", { description: message });
                }
                break;
              }
              case "kai_thinking": {
                setKaiThinking(
                  (typeof data.message === "string" && data.message) ||
                    (typeof data.text === "string" ? data.text : "")
                );
                const r = resolveRound(data);
                if (r === 2 && activeRoundRef.current !== 2) {
                  activeRoundRef.current = 2;
                  setActiveRound(2);
                  setCollapsedRounds({ 1: true, 2: false });
                  toast.info("Entering Round 2: Debate & Rebuttal");
                }
                break;
              }
              case "debate_round":
              case "round_start": {
                const r = resolveRound(data);
                if (r === 2 && activeRoundRef.current !== 2) {
                  activeRoundRef.current = 2;
                  setActiveRound(2);
                  setCollapsedRounds({ 1: true, 2: false });
                }
                break;
              }
              case "agent_start": {
                const r = resolveRound(data);
                if (r === 2 && activeRoundRef.current !== 2) {
                  activeRoundRef.current = 2;
                  setActiveRound(2);
                }
                setActiveAgent((data.agent || "").toString());
                updateAgentState(r, (data.agent || "").toString(), { stage: "active" });
                break;
              }
              case "agent_token": {
                const ag = (data.agent || data.agent_name || "").toString().toLowerCase();
                const txt = (data.text || data.token || "").toString();
                if (!ag || !txt) break;
                const r = resolveRound(data);
                if (r === 2 && activeRoundRef.current !== 2) {
                  activeRoundRef.current = 2;
                  setActiveRound(2);
                }

                const ref = r === 1 ? round1StatesRef : round2StatesRef;
                const runRef = ref.current;
                if (runRef?.[ag]) {
                  runRef[ag] = {
                    ...runRef[ag],
                    stage: runRef[ag].stage === "idle" ? "active" : runRef[ag].stage,
                    text: (runRef[ag].text || "") + txt,
                  };
                }

                const setter = r === 1 ? setRound1States : setRound2States;
                setter((prev) => ({
                  ...prev,
                  [ag]: {
                    ...prev[ag],
                    stage: prev[ag]?.stage === "idle" ? "active" : prev[ag]?.stage,
                    text: (prev[ag]?.text || "") + txt,
                  },
                }));
                break;
              }
              case "agent_complete": {
                const r = resolveRound(data);
                updateAgentState(r, (data.agent || "").toString(), {
                  stage: "complete",
                  text: data.summary || "",
                  thoughts: [],
                  recommendation: data.recommendation,
                  confidence: data.confidence,
                  sources: data.sources,
                  keyMetrics: data.key_metrics,
                  quantMetrics: data.quant_metrics,
                  businessMoat: data.business_moat,
                  financialResilience: data.financial_resilience,
                  growthEfficiency: data.growth_efficiency,
                  bullCase: data.bull_case,
                  bearCase: data.bear_case,
                  sentimentScore: data.sentiment_score,
                  keyCatalysts: data.key_catalysts,
                  valuationMetrics: data.valuation_metrics,
                  peerComparison: data.peer_comparison,
                  priceTargets: data.price_targets,
                });
                break;
              }
              case "agent_error": {
                const r = resolveRound(data);
                const errMsg = data.error || "Agent analysis failed";
                updateAgentState(r, (data.agent || "").toString(), {
                  stage: "error",
                  error: errMsg,
                });
                toast.error(`${data.agent} encountered an error`, {
                  description: errMsg.length > 100 ? errMsg.slice(0, 100) + "..." : errMsg,
                });
                break;
              }
              case "insight_extracted": {
                const insightType = (data.type || "claim") as Insight["type"];
                const newInsight: Insight = {
                  type: insightType,
                  agent: (data.agent || "kai").toString(),
                  content: (data.content || "").toString(),
                  id: data.id ? data.id.toString() : undefined,
                  classification: data.classification ? data.classification.toString() : undefined,
                  confidence: typeof data.confidence === "number" ? data.confidence : undefined,
                  source: data.source ? data.source.toString() : undefined,
                  magnitude: data.magnitude ? data.magnitude.toString() : undefined,
                  score: typeof data.score === "number" ? data.score : undefined,
                  target_claim_id: data.target_claim_id ? data.target_claim_id.toString() : undefined,
                  timestamp: new Date().toISOString(),
                };

                setInsights((prev) => [...prev, newInsight]);
                insightsRef.current.push(newInsight);
                if (data.type === "impact" && (data.magnitude === "high" || data.score >= 8)) {
                  toast(data.classification === "risk" ? "⚠️ Portfolio Risk Detected" : "🚀 Portfolio Opportunity", {
                    description: data.content,
                    action: { label: "View", onClick: () => {} },
                  });
                }
                break;
              }
              case "decision": {
                setDecision(data);
                setKaiThinking("Analysis Complete.");
                setCollapsedRounds({ 1: true, 2: true });
                setBusyOperation("stock_analysis_stream", false);
                if (vaultKey && userId) {
                  KaiHistoryService.saveAnalysis({
                    userId,
                    vaultKey,
                    vaultOwnerToken,
                    entry: {
                      ticker: ticker.toUpperCase(),
                      timestamp: new Date().toISOString(),
                      decision: data.decision || "hold",
                      confidence: data.confidence || 0,
                      consensus_reached: data.consensus_reached ?? false,
                      agent_votes: data.agent_votes || {},
                      final_statement: data.final_statement || "",
                      raw_card: data.raw_card || {},
                      debate_transcript: {
                        round1: round1StatesRef.current,
                        round2: round2StatesRef.current,
                      },
                    },
                  })
                    .then(() => {
                      const cache = CacheService.getInstance();
                      cache.invalidate(CACHE_KEYS.STOCK_CONTEXT(userId, ticker.toUpperCase()));
                      cache.invalidate(CACHE_KEYS.DOMAIN_DATA(userId, "kai_analysis_history"));
                    })
                    .catch((e) => console.warn("[DebateStreamView] History save failed:", e));
                }
                break;
              }
              case "error": {
                const errMsg = data.message || "Analysis failed";
                const errType = classifyError(null, errMsg);
                setBusyOperation("stock_analysis_stream", false);
                const hasProgress =
                  AGENTS.some((agent) => round1StatesRef.current[agent]?.stage !== "idle") ||
                  AGENTS.some((agent) => round2StatesRef.current[agent]?.stage !== "idle");
                if (
                  !hasProgress &&
                  (errType === "rate_limit" || errType === "server_error") &&
                  retryCountRef.current < MAX_RETRIES
                ) {
                  const delay = RETRY_DELAYS[retryCountRef.current] || 8000;
                  retryCountRef.current++;
                  const seconds = Math.ceil(delay / 1000);
                  setRetryCountdown(seconds);
                  setErrorType(errType);
                  setKaiThinking(`Error encountered. Retrying in ${seconds}s...`);

                  retryTimerRef.current = setTimeout(() => {
                    setRetryCountdown(null);
                    resetState();
                    hasStartedRef.current = false;
                    startStream(true);
                  }, delay);
                  return;
                }
                setError(errMsg);
                setErrorType(errType);
                break;
              }
              case "aborted": {
                const errMsg = data.message || "Analysis stream stopped";
                setBusyOperation("stock_analysis_stream", false);
                setError(errMsg);
                setErrorType("connection_lost");
                break;
              }
              default:
                break;
            }
          },
          {
            signal: abortControllerRef.current.signal,
            idleTimeoutMs: 360000,
            requireTerminal: true,
          }
        );
      } catch (err: any) {
        if (err.name === "AbortError") {
          console.log("Stream aborted by user");
          setBusyOperation("stock_analysis_stream", false);
          return;
        }

        console.error("Stream error:", err);
        const errMsg = err.message || "Connection failed";
        const errType = classifyError(null, errMsg);

        // Auto-retry for connection errors (once)
        if (errType === "connection_lost" && retryCountRef.current < 1) {
          retryCountRef.current++;
          setKaiThinking("Connection lost. Reconnecting...");
          retryTimerRef.current = setTimeout(() => {
            hasStartedRef.current = false;
            startStream(true);
          }, 2000);
          return;
        }

        setError(errMsg);
        setErrorType(errType);
        setBusyOperation("stock_analysis_stream", false);
      } finally {
        setLoading(false);
      }
    },
    [ticker, userId, vaultOwnerToken, riskProfileProp, updateAgentState, resetState, setBusyOperation]
  );

  // Effect to start stream on mount
  useEffect(() => {
    startStream();

    // Production-grade disconnect: abort on force-close, mobile swipe-away
    const abortStream = () => abortControllerRef.current?.abort();
    window.addEventListener('beforeunload', abortStream);
    window.addEventListener('pagehide', abortStream);

    let visibilityTimeout: NodeJS.Timeout | undefined;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Mobile: abort after 5s in background (catches swipe-away)
        visibilityTimeout = setTimeout(abortStream, 5000);
      } else {
        clearTimeout(visibilityTimeout);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      window.removeEventListener('beforeunload', abortStream);
      window.removeEventListener('pagehide', abortStream);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimeout(visibilityTimeout);
      setBusyOperation("stock_analysis_stream", false);
    };
  }, [startStream, setBusyOperation]);

  // -------------- RENDER ----------------

  // Error state with classified display
  if (error) {
    const display = getErrorDisplay(errorType, retryCountdown ?? undefined);
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 space-y-4">
        <Card variant="none" effect="glass" showRipple={false} className="max-w-md w-full">
          <CardContent className="p-8 flex flex-col items-center space-y-4">
            <div className="p-4 rounded-full bg-muted/30">{display.icon}</div>
            <h3 className="text-lg font-semibold text-center">{display.title}</h3>
            <p className="text-sm text-muted-foreground text-center">{error}</p>
            {retryCountdown !== null && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon icon={Loader2} size="sm" className="animate-spin" />
                <span>Retrying in {retryCountdown}s...</span>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                variant="none"
                effect="fade"
                size="sm"
                showRipple={false}
                className="border border-border/50 hover:border-border"
                onClick={onClose}
              >
                Close
              </Button>
              {errorType !== "auth_expired" && (
                <Button
                  variant="blue-gradient"
                  effect="fill"
                  size="sm"
                  onClick={() => {
                    retryCountRef.current = 0;
                    resetState();
                    hasStartedRef.current = false;
                    startStream();
                  }}
                >
                  <Icon icon={RefreshCw} size="sm" className="mr-2" /> Retry
                </Button>
              )}
              {errorType === "auth_expired" && (
                <Button variant="blue-gradient" effect="fill" size="sm" onClick={onClose}>
                  <Icon icon={ShieldAlert} size="sm" className="mr-2" /> Re-authenticate
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      {/* Header - continuous glass layer aligned with top app chrome */}
      <div className="flex-none sticky top-0 z-10 mb-4 overflow-hidden rounded-b-3xl border-b border-border/30">
        <div className="absolute inset-0 top-bar-glass pointer-events-none" />
        <div className="relative px-4 pt-3 pb-2 md:max-w-2xl md:mx-auto">
          {/* Hero row: Centered ticker with close button on right */}
          <div className="grid grid-cols-[40px_1fr_40px] items-center">
            {/* Left spacer */}
            <div />
            {/* Center: Ticker + status */}
            <div className="flex flex-col items-center gap-1">
              <h1 className="text-3xl font-black tracking-tighter text-foreground">{ticker}</h1>
              {/* Status badge */}
              {decision ? (
                <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold">
                  <Icon icon={CheckCircle2} size={12} className="mr-1" /> Complete
                </Badge>
              ) : loading ? (
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 font-medium max-w-[240px] truncate">
                  <Icon icon={Loader2} size={12} className="mr-1 animate-spin" /> {kaiThinking}
                </Badge>
              ) : retryCountdown !== null ? (
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                  Retry in {retryCountdown}s
                </Badge>
              ) : null}
            </div>
            {/* Right: Back button */}
            <div className="flex justify-end">
              <Button
                variant="none"
                effect="fade"
                size="sm"
                showRipple={false}
                onClick={handleClose}
                className="shrink-0 h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Icon icon={X} size="xs" />
              </Button>
            </div>
          </div>

          {/* Overall Progress Bar */}
          {!decision && loading && (
            <div className="mt-3">
              <Progress value={overallProgress} className="h-1.5 rounded-full" />
              <p className="text-[10px] text-muted-foreground mt-1 text-center">
                {progressLabel}
              </p>
            </div>
          )}
          {decision && (
            <div className="mt-3">
              <Progress value={100} className="h-1.5 rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Loading State for Initial Connect */}
      {loading && !decision && activeRound === 1 && round1States.fundamental?.stage === "idle" && (
        <div className="p-8 flex justify-center">
          <HushhLoader variant="inline" label="Connecting to agents..." />
        </div>
      )}

      {/* Content - Scrollable */}
      {/* Content - Scrollable split view */}
      <ScrollArea className="flex-1 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto px-4 sm:px-6 pb-10">
          <div className="space-y-6">
            {!decision && (
              <RoundTabsCard
                roundNumber={1}
                title="Initial Deep Analysis"
                description="Agents analyze raw data independently."
                isCollapsed={collapsedRounds[1] || false}
                onToggleCollapse={() => setCollapsedRounds((prev) => ({ ...prev, 1: !prev[1] }))}
                activeAgent={activeRound === 1 ? activeAgent : undefined}
                agentStates={round1States}
                onTabChange={setActiveAgent}
              />
            )}

            {!decision &&
              (activeRound >= 2 ||
                AGENTS.some((agent) => round2States[agent]?.stage !== "idle")) && (
              <RoundTabsCard
                roundNumber={2}
                title="Strategic Debate"
                description="Agents challenge and refine positions."
                isCollapsed={collapsedRounds[2] || false}
                onToggleCollapse={() => setCollapsedRounds((prev) => ({ ...prev, 2: !prev[2] }))}
                activeAgent={activeRound === 2 ? activeAgent : undefined}
                agentStates={round2States}
                onTabChange={setActiveAgent}
              />
            )}

            {decision && (
              <>
                <RoundTabsCard
                  roundNumber={1}
                  title="Initial Deep Analysis"
                  description="Agents analyze raw data independently."
                  isCollapsed={collapsedRounds[1] ?? true}
                  onToggleCollapse={() => setCollapsedRounds((prev) => ({ ...prev, 1: !prev[1] }))}
                  activeAgent={undefined}
                  agentStates={round1States}
                  onTabChange={setActiveAgent}
                />
                <RoundTabsCard
                  roundNumber={2}
                  title="Strategic Debate"
                  description="Agents challenge and refine positions."
                  isCollapsed={collapsedRounds[2] ?? true}
                  onToggleCollapse={() => setCollapsedRounds((prev) => ({ ...prev, 2: !prev[2] }))}
                  activeAgent={undefined}
                  agentStates={round2States}
                  onTabChange={setActiveAgent}
                />
              </>
            )}
          </div>

          <div className="space-y-6 lg:sticky lg:top-4 h-fit">
            {decision ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 ">
                <DecisionCard result={decision} />
              </div>
            ) : (
              <Card variant="none" className="p-5 border-dashed">
                <CardContent className="p-0">
                  <p className="text-sm font-medium">Final recommendation is building...</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Debate rounds are streaming on the left. Decision card appears here as soon as a terminal decision event arrives.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
