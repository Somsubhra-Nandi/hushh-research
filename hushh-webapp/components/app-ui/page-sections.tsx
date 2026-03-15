"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Icon } from "@/lib/morphy-ux/ui";
import { cn } from "@/lib/utils";

type SectionAccent =
  | "default"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "violet";

const ACCENT_STYLES: Record<
  SectionAccent,
  {
    eyebrow: string;
    icon: string;
    divider: string;
    accentText: string;
  }
> = {
  default: {
    eyebrow: "text-primary/82",
    icon: "border-primary/15 bg-primary/9 text-primary",
    divider: "from-primary/28 via-border/95 to-border/45",
    accentText: "text-primary",
  },
  sky: {
    eyebrow: "text-sky-700/85 dark:text-sky-300/85",
    icon: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    divider: "from-sky-500/30 via-border/95 to-border/45",
    accentText: "text-sky-700 dark:text-sky-300",
  },
  emerald: {
    eyebrow: "text-emerald-700/85 dark:text-emerald-300/85",
    icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    divider: "from-emerald-500/28 via-border/95 to-border/45",
    accentText: "text-emerald-700 dark:text-emerald-300",
  },
  amber: {
    eyebrow: "text-amber-700/85 dark:text-amber-300/85",
    icon: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    divider: "from-amber-500/30 via-border/95 to-border/45",
    accentText: "text-amber-700 dark:text-amber-300",
  },
  rose: {
    eyebrow: "text-rose-700/85 dark:text-rose-300/85",
    icon: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    divider: "from-rose-500/30 via-border/95 to-border/45",
    accentText: "text-rose-700 dark:text-rose-300",
  },
  violet: {
    eyebrow: "text-violet-700/85 dark:text-violet-300/85",
    icon: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    divider: "from-violet-500/30 via-border/95 to-border/45",
    accentText: "text-violet-700 dark:text-violet-300",
  },
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
  accent = "default",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  accent?: SectionAccent;
  className?: string;
}) {
  const styles = ACCENT_STYLES[accent];
  return (
    <header className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-start gap-3 sm:gap-5">
            {icon ? (
              <span
                className={cn(
                  "inline-flex h-12 w-12 shrink-0 self-center items-center justify-center rounded-[22px] border shadow-sm sm:h-14 sm:w-14",
                  styles.icon
                )}
              >
                <Icon icon={icon} size="lg" />
              </span>
            ) : null}
            <div className="min-w-0 space-y-1.5">
              {eyebrow ? (
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.3em]",
                    styles.eyebrow
                  )}
                >
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="text-[clamp(1.95rem,4.7vw,2.85rem)] font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              {description ? (
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div
        className={cn(
          "h-px w-full bg-gradient-to-r",
          styles.divider
        )}
      />
    </header>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
  accent = "default",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  accent?: SectionAccent;
  className?: string;
}) {
  const styles = ACCENT_STYLES[accent];
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-3 sm:gap-4">
            {icon ? (
              <span
                className={cn(
                  "inline-flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-[18px] border shadow-sm sm:h-11 sm:w-11",
                  styles.icon
                )}
              >
                <Icon icon={icon} size="md" />
              </span>
            ) : null}
            <div className="min-w-0 space-y-1">
              {eyebrow ? (
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.24em]",
                    styles.eyebrow
                  )}
                >
                  {eyebrow}
                </p>
              ) : null}
              <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {title}
              </h2>
              {description ? (
                <p className="text-sm leading-6 text-muted-foreground sm:text-[15px]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div
        className={cn(
          "h-px w-full bg-gradient-to-r",
          styles.divider
        )}
      />
    </div>
  );
}

export function ContentSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[24px] bg-transparent p-0 shadow-none backdrop-blur-none",
        className
      )}
    >
      {children}
    </section>
  );
}
