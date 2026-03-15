"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Mic, Search } from "lucide-react";

import { KaiCommandPalette, type KaiCommandAction } from "@/components/kai/kai-command-palette";
import { Button } from "@/lib/morphy-ux/button";
import { morphyToast as toast } from "@/lib/morphy-ux/morphy";
import { Icon } from "@/lib/morphy-ux/ui";
import { cn } from "@/lib/utils";
import { useKaiBottomChromeVisibility } from "@/lib/navigation/kai-bottom-chrome-visibility";
import { KAI_COMMAND_BAR_OPEN_EVENT } from "@/lib/navigation/kai-command-bar-events";

interface KaiSearchBarProps {
  onCommand: (command: KaiCommandAction, params?: Record<string, unknown>) => void;
  disabled?: boolean;
  hasPortfolioData?: boolean;
  portfolioTickers?: Array<{
    symbol: string;
    name?: string;
    sector?: string;
    asset_type?: string;
    is_investable?: boolean;
    analyze_eligible?: boolean;
  }>;
}

export function KaiSearchBar({
  onCommand,
  disabled = false,
  hasPortfolioData = true,
  portfolioTickers = [],
}: KaiSearchBarProps) {
  const [open, setOpen] = useState(false);
  const { progress: hideBottomChromeProgress } = useKaiBottomChromeVisibility(true);
  const barRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const barHeight = barRef.current?.getBoundingClientRect().height ?? 48;
      const cssGap = Number.parseFloat(
        getComputedStyle(root).getPropertyValue("--kai-command-bottom-gap")
      );
      const gap = Number.isFinite(cssGap) ? cssGap : 12;
      const total = Math.round(barHeight + gap);
      root.style.setProperty("--kai-command-fixed-ui", `${total}px`);
    };
    update();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => update())
        : null;
    if (barRef.current && ro) {
      ro.observe(barRef.current);
    }
    window.addEventListener("resize", update, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(KAI_COMMAND_BAR_OPEN_EVENT, handleOpen as EventListener);
    return () => {
      window.removeEventListener(KAI_COMMAND_BAR_OPEN_EVENT, handleOpen as EventListener);
    };
  }, []);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 z-[130] flex justify-center px-4"
        style={
          {
            bottom:
              "calc(var(--app-bottom-inset) + var(--kai-command-bottom-gap, 18px) - (var(--bottom-chrome-progress, 0) * var(--app-bottom-fixed-ui)))",
            "--bottom-chrome-progress": String(hideBottomChromeProgress),
          } as CSSProperties
        }
      >
        <div ref={barRef} className="pointer-events-auto w-full max-w-[420px]">
          <div className="relative">
            <Button
              variant="none"
              effect="fade"
              fullWidth
              size="default"
              data-tour-id="kai-command-bar"
              className={cn(
                "chrome-bottom-foreground h-12 justify-start rounded-full px-4 pr-12 text-sm text-muted-foreground",
                disabled && "pointer-events-none opacity-50"
              )}
              onClick={() => setOpen(true)}
            >
              <Icon icon={Search} size="sm" className="mr-2 text-muted-foreground" />
              Analyze, dashboard, consent with Kai
            </Button>
            <button
              type="button"
              aria-label="Hushh Voice (Coming soon)"
              data-no-route-swipe
              className="absolute right-2 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toast.info("Coming soon Hushh Voice Feature");
              }}
            >
              <Icon icon={Mic} size="sm" />
            </button>
          </div>
        </div>
      </div>

      <KaiCommandPalette
        open={open}
        onOpenChange={setOpen}
        onCommand={onCommand}
        hasPortfolioData={hasPortfolioData}
        portfolioTickers={portfolioTickers}
      />
    </>
  );
}
