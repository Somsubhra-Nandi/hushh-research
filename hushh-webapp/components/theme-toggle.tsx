"use client";

import { useEffect, useState } from "react";
import { Moon, Monitor, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { MaterialRipple } from "@/lib/morphy-ux/material-ripple";
import { Icon } from "@/lib/morphy-ux/ui";
import { cn } from "@/lib/utils";

type ThemeOption = "light" | "dark" | "system";

const THEME_OPTIONS: Array<{
  value: ThemeOption;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const normalizedTheme = (theme ?? "").trim().toLowerCase();
  const activeTheme: ThemeOption =
    normalizedTheme === "light" || normalizedTheme === "dark" || normalizedTheme === "system"
      ? (normalizedTheme as ThemeOption)
      : "system";

  if (!mounted) return null;

  return (
    <div
      data-theme-control
      role="radiogroup"
      aria-label="Theme selector"
      className={cn(
        "relative grid w-full min-w-0 grid-cols-3 items-center rounded-[20px] border border-border/80 bg-muted/60 p-1 shadow-sm backdrop-blur-xl sm:w-[216px]",
        className
      )}
    >
      {THEME_OPTIONS.map((option) => {
        const isActive = option.value === activeTheme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => {
              if (option.value === activeTheme) return;
              setTheme(option.value);
            }}
            className={cn(
              "relative flex min-h-10 min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-2xl border px-2 py-2 text-center transition-[background-color,border-color,color,box-shadow] duration-200",
              isActive
                ? "border-border/80 bg-background text-foreground shadow-[0_8px_18px_rgba(15,23,42,0.08)] dark:bg-background/96"
                : "border-transparent bg-transparent text-foreground/72 hover:bg-background/55 hover:text-foreground dark:hover:bg-background/18"
            )}
          >
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Icon icon={option.icon} size="sm" className={cn(isActive && "scale-105")} />
              <span className="text-[11px] font-medium leading-none sm:text-xs">
                {option.label}
              </span>
            </span>
            <MaterialRipple variant="none" effect="fade" className="z-0" />
          </button>
        );
      })}
    </div>
  );
}
