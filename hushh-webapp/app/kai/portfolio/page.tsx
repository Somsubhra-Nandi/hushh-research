"use client";

import { useEffect, useState } from "react";

import { KaiFlow, type FlowState } from "@/components/kai/kai-flow";
import { useAuth } from "@/lib/firebase/auth-context";
import { useStepProgress } from "@/lib/progress/step-progress-context";
import { useVault } from "@/lib/vault/vault-context";

export default function KaiPortfolioPage() {
  const { user, loading: authLoading } = useAuth();
  const { vaultOwnerToken } = useVault();
  const { registerSteps, completeStep, reset } = useStepProgress();

  const [initialized, setInitialized] = useState(false);
  const [flowState, setFlowState] = useState<FlowState>("checking");

  useEffect(() => {
    if (authLoading) return;
    if (!initialized) {
      registerSteps(2);
      setInitialized(true);
    }
    if (user) {
      completeStep();
    }
    return () => reset();
  }, [authLoading, completeStep, initialized, registerSteps, reset, user]);

  useEffect(() => {
    if (!initialized) return;
    if (flowState !== "checking") {
      completeStep();
    }
  }, [completeStep, flowState, initialized]);

  if (authLoading || !user) {
    return null;
  }

  return (
    <div className="app-page-shell relative w-full overflow-x-hidden">
      <div className="w-full pb-32">
        <KaiFlow
          userId={user.uid}
          mode="dashboard"
          vaultOwnerToken={vaultOwnerToken ?? ""}
          onStateChange={setFlowState}
        />
      </div>
    </div>
  );
}
