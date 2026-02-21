"use client";

import { cn } from "@/lib/utils";

export function Spinner({
  className,
  size = 24
}: React.ComponentProps<"div"> & { size?: number }) {
  return (
    <div
      aria-hidden
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <span className="text-muted-foreground">…</span>
    </div>
  );
}
