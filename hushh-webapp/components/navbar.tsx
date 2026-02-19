// components/navbar.tsx
// Bottom Pill Navigation - Hushh PDA

"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, Bell, User, Mic } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useKaiSession } from "@/lib/stores/kai-session-store";
import { usePendingConsentCount } from "@/components/consent/notification-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Icon } from "@/lib/morphy-ux/ui";
import { isOnboardingFlowActiveCookieEnabled } from "@/lib/services/onboarding-route-cookie";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

export const Navbar = () => {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const pendingConsents = usePendingConsentCount();
  const pillRef = React.useRef<HTMLDivElement | null>(null);
  const [onboardingFlowActive, setOnboardingFlowActive] = useState(false);
  const isKaiOnboarding = Boolean(pathname?.startsWith("/kai/onboarding"));
  const useOnboardingChrome = isKaiOnboarding || onboardingFlowActive;

  // Sticky Kai path (last visited /kai or /kai/dashboard/*)
  const lastKaiPath = useKaiSession((s) => s.lastKaiPath);
  const [kaiHref, setKaiHref] = useState("/kai");

  // Measure bottom fixed UI (navbar/theme pill) and expose a single global offset for pinned CTAs.
  React.useLayoutEffect(() => {
    const el = pillRef.current;
    if (!el) return;

    const BOTTOM_GAP_PX = isAuthenticated && !useOnboardingChrome ? 24 : 16; // matches bottom calc for full nav vs compact pill

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
    if (lastKaiPath) {
      setKaiHref(lastKaiPath);
    }
  }, [lastKaiPath]);

  useEffect(() => {
    setOnboardingFlowActive(isOnboardingFlowActiveCookieEnabled());
  }, [pathname]);

  useEffect(() => {
    if (!pathname) return;
    if (pathname && pathname.startsWith("/kai")) {
      useKaiSession.getState().setLastKaiPath(pathname);
      setKaiHref(pathname);
    }
  }, [pathname]);

  // If not authenticated OR onboarding is active, show only the theme toggle.
  if (!isAuthenticated || useOnboardingChrome) {
    return (
      <nav className="fixed bottom-[calc(1rem+var(--app-safe-area-bottom))] left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
        <div ref={pillRef} className="pointer-events-auto shadow-2xl rounded-full">
          <ThemeToggle className="bg-white/80 dark:bg-black/80 backdrop-blur-md border border-gray-200 dark:border-gray-800" />
        </div>
      </nav>
    );
  }

  // Navigation items with consistent sizing
  const navigationItems: NavItem[] = [
    {
      label: "Kai",
      href: kaiHref,
      icon: TrendingUp,
    },
    {
      label: "Consents",
      href: "/consents",
      icon: Bell,
      badge: pendingConsents,
    },
    {
      label: "Profile",
      href: "/profile",
      icon: User,
    },
    {
      label: "Agent Nav",
      href: "/agent-nav",
      icon: Mic,
    },
  ];

  return (
    <nav className="fixed bottom-[calc(1.5rem+var(--app-safe-area-bottom))] inset-x-0 z-[120] flex justify-center px-4 pointer-events-none transform-gpu">
      <div
        ref={pillRef}
        className="pointer-events-auto flex items-center p-1 bg-muted/80 backdrop-blur-3xl border border-white/10 dark:border-white/5 rounded-full shadow-2xl ring-1 ring-black/5 min-h-[45px]"
      >
        {navigationItems.map((item) => {
          // Handle trailing slashes from Capacitor static export
          const normalizedPathname = pathname?.replace(/\/$/, "") || "";
          const normalizedHref = item.href.replace(/\/$/, "");

          const isActive =
            normalizedPathname === normalizedHref ||
            normalizedPathname.startsWith(normalizedHref + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour-id={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
              className={cn(
                "relative flex items-center justify-center gap-2 px-4 py-2.5 rounded-full transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 min-w-[120px]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 min-w-[44px]"
              )}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  icon={item.icon}
                  size="md"
                  className={cn(
                    "transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
                    isActive && "scale-105"
                  )}
                />
                {/* Badge */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-[1.5px] border-muted">
                    {item.badge > 9 ? "9" : item.badge}
                  </span>
                )}
              </div>

              <div
                className={cn(
                  "overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] flex items-center",
                  isActive
                    ? "w-auto max-w-[100px] opacity-100 ml-1"
                    : "w-0 max-w-0 opacity-0"
                )}
              >
                <span className="text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
