"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Slot } from "radix-ui";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { MaterialRipple } from "@/lib/morphy-ux/material-ripple";
import { Icon } from "@/lib/morphy-ux/ui";
import { cn } from "@/lib/utils";

export function SettingsSegmentedTabs({
  value,
  onValueChange,
  options,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative grid w-full grid-cols-3 rounded-[20px] border border-border/80 bg-muted/60 p-1 shadow-sm backdrop-blur-xl sm:rounded-[22px]",
        className
      )}
      style={{
        gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              if (isActive) return;
              onValueChange(option.value);
            }}
            className={cn(
              "relative min-h-9 overflow-hidden rounded-[16px] border px-1.5 py-2 text-center transition-[background-color,border-color,color,box-shadow] sm:min-h-11 sm:rounded-[18px] sm:px-2",
              isActive
                ? "border-border/80 bg-background text-foreground shadow-[0_8px_18px_rgba(15,23,42,0.08)] dark:bg-background/96"
                : "border-transparent bg-transparent text-foreground/68 hover:bg-background/55 hover:text-foreground dark:hover:bg-background/18"
            )}
          >
            <span className="relative z-10 text-[12px] font-medium tracking-tight sm:text-sm">
              {option.label}
            </span>
            <MaterialRipple variant="none" effect="fade" className="z-0" />
          </button>
        );
      })}
    </div>
  );
}

export function SettingsGroup({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      {eyebrow || title || description ? (
        <div className="space-y-1 px-0.5 sm:px-1">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h2 className="text-pretty text-sm font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-[15px]">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere] sm:text-[13px]">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-[22px] border border-foreground/10 bg-background/72 shadow-sm backdrop-blur-sm divide-y divide-foreground/10 dark:border-white/10 dark:divide-white/10 sm:rounded-[28px]">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  asChild = false,
  icon,
  leading,
  title,
  description,
  trailing,
  onClick,
  chevron = false,
  disabled = false,
  tone = "default",
  stackTrailingOnMobile = false,
  className,
}: {
  asChild?: boolean;
  icon?: LucideIcon;
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  disabled?: boolean;
  tone?: "default" | "destructive";
  stackTrailingOnMobile?: boolean;
  className?: string;
}) {
  const isInteractive = !disabled && (typeof onClick === "function" || asChild);
  const shouldStackTrailing = stackTrailingOnMobile && Boolean(trailing) && !chevron;
  const Comp = asChild ? Slot.Root : onClick ? "button" : "div";
  const content = (
    <>
      <div
        className={cn(
          "pointer-events-none relative z-10 flex min-w-0 gap-2.5 sm:gap-3",
          shouldStackTrailing ? "items-start sm:items-center" : "items-center"
        )}
      >
        {leading ? (
          <span className="inline-flex shrink-0 self-center">{leading}</span>
        ) : icon ? (
          <span
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-2xl bg-muted/65 text-muted-foreground sm:h-10 sm:w-10",
              tone === "destructive" && "bg-destructive/10 text-destructive"
            )}
          >
            <Icon icon={icon} size="md" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div
            className={cn(
              "text-sm font-medium tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-[15px]",
              tone === "destructive" && "text-destructive"
            )}
          >
            {title}
          </div>
          {description ? (
            <div className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere] sm:text-[13px]">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      {trailing || chevron ? (
        <div
          className={cn(
            "relative z-10 flex max-w-full shrink-0 items-center justify-end self-center gap-2",
            shouldStackTrailing &&
              "w-full justify-start pl-[2.65rem] pt-1 sm:w-auto sm:justify-end sm:pl-0 sm:pt-0"
          )}
        >
          {trailing}
          {chevron ? (
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground/90 transition-transform",
                isInteractive && "group-hover:translate-x-0.5"
              )}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );

  const sharedClassName = cn(
    "group relative grid w-full overflow-hidden px-3 py-3.5 text-left sm:px-4 sm:py-4",
    shouldStackTrailing
      ? "grid-cols-1 gap-y-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-3 sm:gap-y-0"
      : "grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3",
    isInteractive &&
      "transition-[border-color,box-shadow] before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:bg-muted/0 before:transition-[background-color,opacity] before:duration-200 hover:before:bg-muted/36 active:before:bg-muted/48",
    disabled && "cursor-not-allowed opacity-60",
    className
  );

  return (
    <Comp
      {...(!asChild && onClick
        ? { type: "button" as const, onClick, disabled }
        : !asChild
          ? { "aria-disabled": disabled || undefined }
          : {})}
      className={sharedClassName}
    >
      {content}
      {isInteractive ? (
        <MaterialRipple
          variant="none"
          effect="fade"
          disabled={disabled}
          className="z-[2]"
        />
      ) : null}
    </Comp>
  );
}

export function SettingsDetailPanel({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[100dvh] max-h-[100dvh] rounded-none border-none bg-background">
          <DrawerHeader className="sticky top-0 z-10 border-b border-border/90 bg-background/96 px-4 py-3.5 text-left backdrop-blur-xl sm:px-5 sm:py-5">
            <DrawerTitle className="text-base font-semibold tracking-tight">
              {title}
            </DrawerTitle>
            {description ? (
              <DrawerDescription className="text-sm leading-5 sm:leading-6">
                {description}
              </DrawerDescription>
            ) : null}
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-3 sm:px-4 sm:pt-4">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal>
      <SheetContent
        side="right"
        className="w-full border-l border-border/90 p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-border/90 bg-background/96 px-6 py-5 backdrop-blur-xl">
          <SheetTitle className="text-base font-semibold tracking-tight">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="text-sm leading-6">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:px-5 sm:pt-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
