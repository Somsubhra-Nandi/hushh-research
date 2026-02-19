"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/lib/morphy-ux/card";
import { Icon } from "@/lib/morphy-ux/ui";
import { CircleCheck, Home, Landmark, User } from "lucide-react";

const KYC_ITEMS = [
  {
    label: "Identity verified",
    icon: User,
    iconTone: "text-[var(--tone-blue)] bg-[var(--tone-blue-bg)]",
  },
  {
    label: "Address verified",
    icon: Home,
    iconTone: "text-violet-600 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/35",
  },
  {
    label: "Bank account linked",
    icon: Landmark,
    iconTone: "text-[var(--tone-green)] bg-[var(--tone-green-bg)]",
  },
] as const;

export function KycPreviewCompact() {
  return (
    <Card
      variant="none"
      effect="glass"
      preset="hero"
      glassAccent="balanced"
      showRipple={false}
      className="h-full w-full"
    >
      <div className="morphy-theme-content relative overflow-hidden p-7">
        <div className="relative space-y-6">
          <h3 className="text-center text-xl font-extrabold tracking-tight">
            Status: KYC completed
          </h3>

          <div className="space-y-3">
            {KYC_ITEMS.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-2xl border border-background/70 bg-background/50 px-3.5 py-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`grid h-10 w-10 place-items-center rounded-full ${item.iconTone}`}
                  >
                    <Icon icon={item.icon} size="md" />
                  </div>
                  <span className="text-[15px] font-semibold">{item.label}</span>
                </div>
                <Icon icon={CircleCheck} size="lg" className="text-emerald-500" />
              </div>
            ))}
          </div>

          <div className="space-y-2 text-center">
            <Badge className="rounded-full border border-[var(--brand-200)] bg-[var(--brand-50)] px-4 py-1.5 text-[11px] font-bold tracking-wide text-[var(--tone-blue)] uppercase">
              SPEED: INSTANT
            </Badge>
            <p className="text-xs font-medium text-muted-foreground">
              Accelerated by 90% via automated verification
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
