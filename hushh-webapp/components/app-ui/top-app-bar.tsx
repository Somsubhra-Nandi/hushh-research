"use client";

/**
 * Unified Top Shell
 *
 * Single fixed component that owns the entire top chrome:
 *   1. Capacitor safe-area inset (notch / Dynamic Island)
 *   2. Header row  –  back · title · actions
 *   3. Swipeable route tabs (when the route enables them, e.g. /kai)
 *
 * One continuous frosted-glass backdrop + mask-image fade covers all
 * three layers so that page content scrolls seamlessly underneath.
 *
 * All sizing uses CSS custom properties from globals.css
 * (--top-inset, --top-bar-h, --top-tabs-total, --top-glass-h, etc.)
 * so the layout works identically on web and native with zero
 * Capacitor.isNativePlatform() checks — env(safe-area-inset-top)
 * evaluates correctly in both environments.
 */

import { useMemo, useState } from "react";
import { ArrowLeft, LogOut, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/lib/navigation/navigation-context";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/lib/morphy-ux/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useVault } from "@/lib/vault/vault-context";
import { resolveDeleteAccountAuth } from "@/lib/flows/delete-account";
import { AccountService } from "@/lib/services/account-service";
import {
  setOnboardingFlowActiveCookie,
  setOnboardingRequiredCookie,
} from "@/lib/services/onboarding-route-cookie";
import { CacheSyncService } from "@/lib/cache/cache-sync-service";
import { getKaiChromeState } from "@/lib/navigation/kai-chrome-state";
import { ROUTES } from "@/lib/navigation/routes";
import { DebateTaskCenter } from "@/components/app-ui/debate-task-center";
import { UserLocalStateService } from "@/lib/services/user-local-state-service";
import { DashboardRouteTabs } from "@/components/kai/layout/dashboard-route-tabs";
import { resolveTopShellMetrics } from "@/components/app-ui/top-shell-metrics";
import { useKaiBottomChromeVisibility } from "@/lib/navigation/kai-bottom-chrome-visibility";

/* ── Re-exports (backward compat) ─────────────────────────────────── */
export {
  resolveTopShellHeight,
  resolveTopShellMetrics,
  shouldHideTopShell,
  shouldShowKaiTabsInTopShell,
  type TopShellMetrics,
} from "@/components/app-ui/top-shell-metrics";

/* ── Constants ─────────────────────────────────────────────────────── */
export const TOP_SHELL_ICON_BUTTON_CLASSNAME =
  "grid h-11 w-11 place-items-center rounded-full border border-border/60 bg-background/70 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted/50 active:bg-muted/80";

/* ── Stubs (kept for import stability) ─────────────────────────────── */
export function TopBarBackground() { return null; }
export function StatusBarBlur() { return null; }
export function TopAppBarSpacer() { return null; }

/* ── Helpers ───────────────────────────────────────────────────────── */
function getTopBarTitle(pathname: string): string | null {
  if (pathname.startsWith(ROUTES.KAI_HOME)) return "Kai";
  if (pathname.startsWith(ROUTES.RIA_HOME)) return "RIA";
  if (pathname.startsWith(ROUTES.MARKETPLACE)) return "Marketplace";
  if (pathname.startsWith(ROUTES.CONSENTS)) return "Consents";
  if (pathname.startsWith(ROUTES.PROFILE)) return "Profile";
  return null;
}

/* ── TopAppBar ─────────────────────────────────────────────────────── */
interface TopAppBarProps {
  className?: string;
}

export function TopAppBar({ className }: TopAppBarProps) {
  const { handleBack } = useNavigation();
  const { isVaultUnlocked } = useVault();
  const pathname = usePathname();
  const topShellMetrics = useMemo(() => resolveTopShellMetrics(pathname), [pathname]);
  const chromeState = useMemo(() => getKaiChromeState(pathname), [pathname]);
  const showOnboardingActions = chromeState.useOnboardingChrome;
  const hideChrome = !topShellMetrics.shellVisible;
  const centerTitle = useMemo(() => getTopBarTitle(pathname), [pathname]);
  const showKaiTabs = topShellMetrics.hasTabs;

  // Subscribe to scroll-direction store so top glass height follows tabs visibility.
  const { progress: tabsScrollHideProgress } = useKaiBottomChromeVisibility(showKaiTabs);

  const topGlassStyle = useMemo<React.CSSProperties>(
    () => ({
      height: showKaiTabs
        ? `calc(var(--top-inset) + var(--top-systembar-row-gap, 0px) + var(--top-bar-h) + ((1 - ${tabsScrollHideProgress}) * var(--top-tabs-h)) + var(--top-fade-active))`
        : "calc(var(--top-inset) + var(--top-systembar-row-gap, 0px) + var(--top-bar-h) + var(--top-fade-active))",
      "--app-bar-glass-bg-light": "rgba(255, 255, 255, 0.46)",
      "--app-bar-glass-bg-dark": "rgba(10, 12, 16, 0.64)",
      "--app-bar-glass-blur": "7px",
      maskImage:
        "linear-gradient(to bottom, black 0%, black 56%, rgba(0, 0, 0, 0.96) 70%, rgba(0, 0, 0, 0.78) 84%, rgba(0, 0, 0, 0.42) 94%, transparent 100%)",
      WebkitMaskImage:
        "linear-gradient(to bottom, black 0%, black 56%, rgba(0, 0, 0, 0.96) 70%, rgba(0, 0, 0, 0.78) 84%, rgba(0, 0, 0, 0.42) 94%, transparent 100%)",
    }),
    [showKaiTabs, tabsScrollHideProgress]
  );

  if (hideChrome) return null;

  return (
    <div
      className={cn("fixed inset-x-0 top-0 z-50 pointer-events-none", className)}
    >
      <div className="relative w-full overflow-hidden">
        {/* ── Unified glass backdrop ───────────────────────────────── */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 bar-glass"
          style={topGlassStyle}
        />

        {/* ── Interactive content layer ────────────────────────────── */}
        <div
          className="relative mx-auto w-full max-w-[540px] px-4 sm:px-6"
          style={{ paddingTop: "calc(var(--top-inset) + var(--top-systembar-row-gap, 0px))" }}
        >
          {/* Header row: back · title · actions */}
          <div
            data-testid="top-app-bar-row"
            className="grid h-11 shrink-0 grid-cols-[44px_1fr_44px] items-center pointer-events-auto"
          >
            <div className="flex h-11 w-11 items-center justify-center">
              <button
                onClick={handleBack}
                className={TOP_SHELL_ICON_BUTTON_CLASSNAME}
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            </div>

            <div className="flex min-w-0 items-center justify-center px-2">
              {centerTitle ? (
                <span className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  {centerTitle}
                </span>
              ) : null}
            </div>

            <div className="flex h-11 w-11 items-center justify-center">
              {showOnboardingActions ? (
                <OnboardingRouteActions />
              ) : isVaultUnlocked ? (
                <DebateTaskCenter triggerClassName={TOP_SHELL_ICON_BUTTON_CLASSNAME} />
              ) : (
                <div className="h-11 w-11" aria-hidden />
              )}
            </div>
          </div>

          {/* Tabs row (only on routes that enable them) */}
          {showKaiTabs ? (
            <div
              className="flex shrink-0 items-end pointer-events-auto"
              style={{ height: "var(--top-tabs-h)" }}
            >
              <DashboardRouteTabs embedded />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── OnboardingRouteActions ────────────────────────────────────────── */
function OnboardingRouteActions() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { vaultOwnerToken } = useVault();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSignOut() {
    try {
      setOnboardingRequiredCookie(false);
      setOnboardingFlowActiveCookie(false);
      await signOut();
      router.push(ROUTES.HOME);
    } catch (error) {
      console.error("[TopAppBar] Failed to sign out:", error);
      toast.error("Couldn't sign out. Please retry.");
    }
  }

  async function handleDeleteAccount() {
    if (!user?.uid) return;

    setIsDeleting(true);
    try {
      const resolution = await resolveDeleteAccountAuth({
        userId: user.uid,
        existingVaultOwnerToken: vaultOwnerToken ?? null,
      });

      if (resolution.kind === "needs_unlock") {
        toast.error("Unlock your vault from Profile to delete this account.");
        router.push(ROUTES.PROFILE);
        return;
      }

      await AccountService.deleteAccount(resolution.token);
      CacheSyncService.onAccountDeleted(user.uid);
      await UserLocalStateService.clearForUser(user.uid);
      setOnboardingRequiredCookie(false);
      setOnboardingFlowActiveCookie(false);

      toast.success("Account deleted.");
      await signOut();
      router.push(ROUTES.HOME);
    } catch (error) {
      console.error("[TopAppBar] Failed to delete account:", error);
      toast.error("Failed to delete account. Please retry.");
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="none"
            effect="fade"
            size="icon"
            className="h-9 w-9 rounded-full"
            aria-label="Account actions"
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void handleSignOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteConfirmOpen(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
            Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (!isDeleting) void handleDeleteAccount();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
