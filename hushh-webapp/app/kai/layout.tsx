"use client";

/**
 * Kai Layout - Minimal Mobile-First
 *
 * Wraps all /kai routes with VaultLockGuard.
 * ConsentSSEProvider and ConsentNotificationProvider are mounted at root (providers.tsx).
 */

import { VaultLockGuard } from "@/components/vault/vault-lock-guard";
import { KaiSearchBar } from "@/components/kai/kai-search-bar";
import { KaiOnboardingGuard } from "@/components/kai/onboarding/kai-onboarding-guard";
import { KaiNavTour } from "@/components/kai/onboarding/kai-nav-tour";
import { VaultMethodPrompt } from "@/components/vault/vault-method-prompt";
import { usePathname, useRouter } from "next/navigation";
import { useKaiSession } from "@/lib/stores/kai-session-store";

export default function KaiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const setAnalysisParams = useKaiSession((s) => s.setAnalysisParams);
  const isSearchDisabled = useKaiSession((s) => s.isSearchDisabled);
  const isReviewActive = useKaiSession(
    (s) => Boolean(s.busyOperations.portfolio_review_active)
  );
  const isManageActive = useKaiSession(
    (s) => Boolean(s.busyOperations.portfolio_manage_active)
  );
  const onOnboardingRoute = pathname.startsWith("/kai/onboarding");
  const onKaiHomeRoute = pathname === "/kai";
  const onImportRoute = pathname.startsWith("/kai/import");
  const onAnalysisRoute = pathname.startsWith("/kai/dashboard/analysis");
  const onPortfolioHealthRoute = pathname.startsWith("/kai/dashboard/portfolio-health");
  const hideSearchBar =
    isReviewActive || isManageActive || onOnboardingRoute || onKaiHomeRoute || onImportRoute;
  const disableSearch =
    isSearchDisabled ||
    onAnalysisRoute ||
    onPortfolioHealthRoute ||
    onOnboardingRoute ||
    onKaiHomeRoute ||
    onImportRoute;
  const shouldEnableMethodPrompt = !onOnboardingRoute && !onImportRoute;

  return (
    <VaultLockGuard>
      <KaiOnboardingGuard>
        <div className="flex flex-col min-h-screen">
          <main className="flex-1 pb-32">{children}</main>
          <VaultMethodPrompt enabled={shouldEnableMethodPrompt} />
          <KaiNavTour />

          {/* Bottom-fixed search bar across all /kai routes (hidden on review/manage/onboarding screens to avoid overlap) */}
          {!hideSearchBar && (
            <KaiSearchBar
              disabled={disableSearch}
              onCommand={(command, params) => {
                if (command === "analyze" && params?.symbol) {
                  const symbol = String(params.symbol).toUpperCase();

                  // Prime-assets-equivalent behavior:
                  // - set Zustand analysis params
                  // - navigate to analysis hub (no querystring)
                  // IMPORTANT: userId must be the real Firebase user id, otherwise the backend
                  // will 403 (token user mismatch) when streaming starts.
                  //
                  // We intentionally do NOT set a placeholder userId here; the analysis page
                  // already has `useAuth()` and will normalize if needed.
                  setAnalysisParams({
                    ticker: symbol,
                    userId: "",
                    riskProfile: "balanced",
                  });

                  router.push("/kai/dashboard/analysis");
                }
              }}
            />
          )}
        </div>
      </KaiOnboardingGuard>
    </VaultLockGuard>
  );
}
