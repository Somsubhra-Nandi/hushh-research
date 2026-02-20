// components/navbar.tsx
// Bottom pill navigation + onboarding theme control.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Mic, Shield, TrendingUp, User } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { usePendingConsentCount } from "@/components/consent/notification-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useKaiSession } from "@/lib/stores/kai-session-store";
import { isOnboardingFlowActiveCookieEnabled } from "@/lib/services/onboarding-route-cookie";
import { SegmentedPill, type SegmentedPillOption } from "@/lib/morphy-ux/ui";

type NavKey = "kai" | "consents" | "profile" | "agent-nav";

export const Navbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const pendingConsents = usePendingConsentCount();
  const pillRef = React.useRef<HTMLDivElement | null>(null);
  const [onboardingFlowActive, setOnboardingFlowActive] = useState(false);
  const isKaiOnboarding = Boolean(pathname?.startsWith("/kai/onboarding"));
  const useOnboardingChrome = isKaiOnboarding || onboardingFlowActive;

  const lastKaiPath = useKaiSession((s) => s.lastKaiPath);
  const busyOperations = useKaiSession((s) => s.busyOperations);
  const [kaiHref, setKaiHref] = useState("/kai");

  React.useLayoutEffect(() => {
    const el = pillRef.current;
    if (!el) return;

    const BOTTOM_GAP_PX = isAuthenticated && !useOnboardingChrome ? 14 : 10;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const height = Math.max(0, rect.height);
      const px = Math.round(height + BOTTOM_GAP_PX);
      document.documentElement.style.setProperty("--app-bottom-fixed-ui", `${px}px`);
    };

    update();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => update())
        : null;
    ro?.observe(el);

    window.addEventListener("resize", update, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [isAuthenticated, useOnboardingChrome]);

  useEffect(() => {
    setOnboardingFlowActive(isOnboardingFlowActiveCookieEnabled());
  }, [pathname]);

  useEffect(() => {
    if (lastKaiPath) setKaiHref(lastKaiPath);
  }, [lastKaiPath]);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/kai")) {
      useKaiSession.getState().setLastKaiPath(pathname);
      setKaiHref(pathname);
    }
  }, [pathname]);

  const navOptions = useMemo<SegmentedPillOption[]>(
    () => [
      {
        value: "kai",
        label: "Kai",
        icon: TrendingUp,
        dataTourId: "nav-kai",
      },
      {
        value: "consents",
        label: "Consents",
        icon: Shield,
        badge: pendingConsents,
        dataTourId: "nav-consents",
      },
      {
        value: "profile",
        label: "Profile",
        icon: User,
        dataTourId: "nav-profile",
      },
      {
        value: "agent-nav",
        label: "Agent Nav",
        icon: Mic,
        dataTourId: "nav-agent-nav",
      },
    ],
    [pendingConsents]
  );

  if (!isAuthenticated || useOnboardingChrome) {
    return (
      <nav
        className="fixed left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
        style={{ bottom: "max(var(--app-safe-area-bottom-effective), 0.5rem)" }}
      >
        <div ref={pillRef} className="pointer-events-auto">
          <ThemeToggle className="bg-white/85 dark:bg-black/85" />
        </div>
      </nav>
    );
  }

  const normalizedPathname = pathname?.replace(/\/$/, "") || "";
  const activeNav: NavKey = normalizedPathname.startsWith("/consents")
    ? "consents"
    : normalizedPathname.startsWith("/profile")
      ? "profile"
      : normalizedPathname.startsWith("/agent-nav")
        ? "agent-nav"
        : "kai";

  const navigateTo = (value: string) => {
    const reviewDirty = Boolean(
      busyOperations["portfolio_review_active"] && busyOperations["portfolio_review_dirty"]
    );
    if (
      reviewDirty &&
      !window.confirm("You have unsaved portfolio changes. Leaving now will discard them.")
    ) {
      return;
    }

    switch (value as NavKey) {
      case "kai":
        router.push(kaiHref);
        return;
      case "consents":
        router.push("/consents");
        return;
      case "profile":
        router.push("/profile");
        return;
      case "agent-nav":
        router.push("/agent-nav");
        return;
      default:
        return;
    }
  };

  return (
    <nav
      className="fixed inset-x-0 z-[120] flex justify-center px-4 pointer-events-none transform-gpu"
      style={{ bottom: "max(var(--app-safe-area-bottom-effective), 0.75rem)" }}
    >
      <SegmentedPill
        ref={pillRef}
        size="compact"
        value={activeNav}
        options={navOptions}
        onValueChange={navigateTo}
        ariaLabel="Main navigation"
        className="pointer-events-auto w-full max-w-[460px]"
      />
    </nav>
  );
};
