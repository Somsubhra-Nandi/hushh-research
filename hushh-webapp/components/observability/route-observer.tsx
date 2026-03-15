"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { trackPageView } from "@/lib/observability/client";

export function ObservabilityRouteObserver() {
  const pathname = usePathname();
  const mountedRef = useRef(false);

  useEffect(() => {
    trackPageView(pathname, mountedRef.current ? "route_change" : "initial_load");
    mountedRef.current = true;
  }, [pathname]);

  return null;
}
