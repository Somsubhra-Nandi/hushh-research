"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  activeRiaRouteTabFromPath,
  RIA_ROUTE_TABS,
} from "@/lib/navigation/ria-route-tabs";
import { cn } from "@/lib/utils";

export function RiaRouteTabs({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = useMemo(
    () => activeRiaRouteTabFromPath(pathname || "/ria"),
    [pathname]
  );

  return (
    <div
      className={cn(
        "w-full pb-2",
        embedded ? "pt-1" : "pt-2"
      )}
      data-tour-id="ria-route-tabs"
    >
      <div className="grid w-full grid-cols-4 gap-2 rounded-[22px] border border-border/50 bg-background/65 p-1.5 shadow-sm backdrop-blur-md">
        {RIA_ROUTE_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => router.push(tab.href)}
              className={cn(
                "min-h-11 rounded-[18px] px-2 text-[12px] font-semibold tracking-tight transition-all",
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
