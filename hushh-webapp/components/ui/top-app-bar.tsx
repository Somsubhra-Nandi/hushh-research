"use client";

/**
 * TopAppBar - Smart Mobile Navigation Header
 *
 * Shows back button on all pages except the landing page ("/").
 * On root-level pages (/kai, /consents, /profile), triggers exit dialog.
 * On sub-pages (Level 2+), navigates to parent route.
 *
 * On native: StatusBarBlur (safe-area strip) and TopAppBar (breadcrumb bar) share
 * the same transparent blur style so the Capacitor status bar area and breadcrumb
 * bar match (one continuous frosted look).
 *
 * Place this at the layout level for seamless integration.
 */

import { useState, useEffect } from "react";
import { ArrowLeft, LogOut, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/lib/navigation/navigation-context";
import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { PreVaultOnboardingService } from "@/lib/services/pre-vault-onboarding-service";
import {
  isOnboardingFlowActiveCookieEnabled,
  setOnboardingFlowActiveCookie,
  setOnboardingRequiredCookie,
} from "@/lib/services/onboarding-route-cookie";

/** Shared style so Capacitor status bar area and breadcrumb bar match (masked blur on all platforms) */
const BAR_GLASS_CLASS = "top-bar-glass";

/**
 * TopBarBackground - Single background layer for status bar and top app bar.
 * Ensures a continuous frosted look with a single smooth fade mask.
 */
export function TopBarBackground() {
  const [isNative, setIsNative] = useState(false);
  const pathname = usePathname();
  const hideChrome = pathname === "/" || pathname.startsWith("/login");

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  if (hideChrome) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-40",
        BAR_GLASS_CLASS,
        isNative ? "h-[calc(env(safe-area-inset-top)+72px)]" : "h-[64px]"
      )}
      aria-hidden
    />
  );
}

/**
 * StatusBarBlur - No longer renders its own glass, now handled by TopBarBackground.
 * But we keep it as a spacer/logic holder if needed, or just return null.
 */
export function StatusBarBlur() {
  return null;
}

interface TopAppBarProps {
  className?: string;
}

export function TopAppBar({ className }: TopAppBarProps) {
  const { handleBack } = useNavigation();
  const [isNative, setIsNative] = useState(false);
  const [onboardingFlowActive, setOnboardingFlowActive] = useState(false);
  const pathname = usePathname();
  const onKaiOnboarding = pathname.startsWith("/kai/onboarding");
  const showOnboardingActions = onKaiOnboarding || onboardingFlowActive;
  const hideChrome = pathname === "/" || pathname.startsWith("/login");

  useEffect(() => {
    // Check platform on mount to avoid hydration mismatch
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  useEffect(() => {
    setOnboardingFlowActive(isOnboardingFlowActiveCookieEnabled());
  }, [pathname]);

  // Don't show TopAppBar on landing page
  if (hideChrome) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed left-0 right-0 z-50",
        isNative ? "top-[env(safe-area-inset-top)] h-[72px]" : "top-0 h-[64px]",
        // Flex container for back button
        "flex items-center justify-between pb-2 px-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 rounded-full hover:bg-muted/50 active:bg-muted/80 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>

        <Breadcrumb>
          <BreadcrumbList className="text-lg">
            {pathname
              .split("/")
              .filter(Boolean)
              .map((segment, index, arr) => {
                const height = arr.length;
                const isLast = index === height - 1;
                const href = `/${arr.slice(0, index + 1).join("/")}`;
                const label =
                  segment.charAt(0).toUpperCase() + segment.slice(1);

                return (
                  <div key={href} className="flex items-center gap-2">
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={href}>{label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </div>
                );
              })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {showOnboardingActions && <OnboardingRouteActions />}
    </div>
  );
}

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
      router.push("/");
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
        router.push("/profile");
        return;
      }

      await AccountService.deleteAccount(resolution.token);
      await PreVaultOnboardingService.clear(user.uid);
      setOnboardingRequiredCookie(false);
      setOnboardingFlowActiveCookie(false);

      toast.success("Account deleted.");
      await signOut();
      router.push("/");
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

/**
 * TopAppBarSpacer - Smart spacer that handles top content padding
 * - Landing Page: No spacer needed (body padding handles safe area)
 * - Sub Pages: Adds padding for TopAppBar only (body handles safe area)
 * - Native with overlay: spacer = 64px + safe-area so content clears blurred bar
 */
export function TopAppBarSpacer() {
  const pathname = usePathname();
  const [isNative, setIsNative] = useState(false);
  const hideChrome = pathname === "/" || pathname.startsWith("/login");

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Landing page: no spacer needed (body padding handles safe area)
  if (hideChrome) {
    return null;
  }

  // Sub-pages: clear the fixed TopAppBar; on native bar extends into safe area
  return (
    <div
      className={cn(
        "w-full shrink-0 transition-[height]",
        isNative ? "h-[calc(72px+env(safe-area-inset-top))]" : "h-[64px]",
      )}
    />
  );
}
