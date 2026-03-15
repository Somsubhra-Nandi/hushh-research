"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BriefcaseBusiness, ShieldCheck, TriangleAlert } from "lucide-react";

import {
  ContentSurface,
  PageHeader,
  SectionHeader,
} from "@/components/app-ui/page-sections";
import { cn } from "@/lib/utils";

export function RiaPageShell({
  eyebrow,
  title,
  description,
  actions,
  icon = BriefcaseBusiness,
  statusPanel,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
  statusPanel?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-5xl px-4 pb-28 pt-[var(--kai-view-top-gap,16px)] sm:px-6",
        className
      )}
    >
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
        icon={icon}
      />

      {statusPanel ? <div className="mt-5">{statusPanel}</div> : null}

      <div className="mt-5 space-y-5">{children}</div>
    </main>
  );
}

export function RiaSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ContentSurface className={className}>{children}</ContentSurface>;
}

export function RiaCompatibilityState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader
        eyebrow="Compatibility Mode"
        title={title}
        description={description}
        icon={TriangleAlert}
      />
      <RiaSurface className="border-dashed border-amber-500/40 bg-amber-500/5">
        <p className="text-sm leading-6 text-muted-foreground">
          This surface is running in degraded compatibility mode until the full IAM contract is
          available in the active environment.
        </p>
      </RiaSurface>
    </section>
  );
}

export function MetricTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-[22px] border border-border/60 bg-background/75 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

type RiaStatusTone = "neutral" | "warning" | "success" | "critical";

type RiaStatusItem = {
  label: string;
  value: string;
  helper?: string;
  tone?: RiaStatusTone;
};

const STATUS_TONE_STYLES: Record<RiaStatusTone, string> = {
  neutral: "border-border/60 bg-background/75 text-foreground",
  warning: "border-primary/20 bg-primary/6 text-foreground",
  success: "border-emerald-500/20 bg-emerald-500/8 text-foreground",
  critical: "border-red-500/20 bg-red-500/8 text-foreground",
};

export function RiaStatusPanel({
  title,
  description,
  items,
  actions,
  className,
}: {
  title: string;
  description?: string;
  items: RiaStatusItem[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <SectionHeader
        eyebrow="Status"
        title={title}
        description={description}
        actions={actions}
        icon={ShieldCheck}
      />
      <RiaSurface className="bg-gradient-to-br from-primary/8 via-card/95 to-card/88">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              className={cn(
                "rounded-[22px] border p-4 shadow-sm",
                STATUS_TONE_STYLES[item.tone || "neutral"]
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">{item.value}</p>
              {item.helper ? <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p> : null}
            </div>
          ))}
        </div>
      </RiaSurface>
    </section>
  );
}
