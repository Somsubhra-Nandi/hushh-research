"use client";

/**
 * Kai Layout - Minimal Mobile-First
 *
 * Wraps all /kai routes with VaultLockGuard and onboarding guard.
 */

import { VaultLockGuard } from "@/components/vault/vault-lock-guard";
import { KaiOnboardingGuard } from "@/components/kai/onboarding/kai-onboarding-guard";
import { KaiNavTour } from "@/components/kai/onboarding/kai-nav-tour";
import { DashboardRouteTabs } from "@/components/kai/layout/dashboard-route-tabs";
import { VaultMethodPrompt } from "@/components/vault/vault-method-prompt";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import { useVault } from "@/lib/vault/vault-context";
import { UnlockWarmOrchestrator } from "@/lib/services/unlock-warm-orchestrator";
import { useKaiSession } from "@/lib/stores/kai-session-store";
import { Loader2 } from "lucide-react";

export default function KaiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { vaultKey, vaultOwnerToken } = useVault();
  const onOnboardingRoute = pathname.startsWith("/kai/onboarding");
  const onImportRoute = pathname.startsWith("/kai/import");
  const showKaiRouteTabs = !onOnboardingRoute && !onImportRoute;
  const shouldEnableMethodPrompt = !onOnboardingRoute && !onImportRoute;
  const busyOperations = useKaiSession((s) => s.busyOperations);
  const isPortfolioSaveBlocking = Boolean(busyOperations["portfolio_save"]);

  useEffect(() => {
    if (onOnboardingRoute || onImportRoute) return;
    if (!user?.uid || !vaultKey || !vaultOwnerToken) return;

    void UnlockWarmOrchestrator.run({
      userId: user.uid,
      vaultKey,
      vaultOwnerToken,
      routePath: pathname,
    }).catch((error) => {
      console.warn("[KaiLayout] Route-priority warm orchestration failed:", error);
    });
  }, [onImportRoute, onOnboardingRoute, pathname, user?.uid, vaultKey, vaultOwnerToken]);

  return (
    <VaultLockGuard>
      <KaiOnboardingGuard>
        <div className="flex min-h-screen flex-col [--morphy-glass-accent-a:rgba(148,163,184,0.08)] [--morphy-glass-accent-b:rgba(226,232,240,0.08)] dark:[--morphy-glass-accent-a:rgba(63,63,70,0.16)] dark:[--morphy-glass-accent-b:rgba(82,82,91,0.14)]">
          {showKaiRouteTabs ? <DashboardRouteTabs /> : null}
          <main className={cn("flex-1 pb-32", showKaiRouteTabs ? "pt-14" : undefined)}>
            {children}
          </main>
          <VaultMethodPrompt enabled={shouldEnableMethodPrompt} />
          <KaiNavTour />
          {isPortfolioSaveBlocking ? (
            <div
              className="fixed inset-0 z-[430] flex items-center justify-center bg-black/28 backdrop-blur-[6px] [-webkit-backdrop-filter:blur(6px)]"
              aria-live="polite"
              aria-busy="true"
              data-no-route-swipe
            >
              <div className="rounded-2xl border border-white/20 bg-black/45 px-5 py-4 text-center text-white shadow-2xl">
                <div className="inline-flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving to vault...
                </div>
                <p className="mt-1 text-xs text-white/80">Please wait until encryption completes.</p>
              </div>
            </div>
          ) : null}
        </div>
      </KaiOnboardingGuard>
    </VaultLockGuard>
  );
}
