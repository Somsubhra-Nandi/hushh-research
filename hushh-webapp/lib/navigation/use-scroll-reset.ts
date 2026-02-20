"use client";

import { useEffect } from "react";

const APP_SCROLL_ROOT_SELECTOR = "[data-app-scroll-root='true']";

export function getAppScrollRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(APP_SCROLL_ROOT_SELECTOR);
}

export function scrollAppToTop(behavior: ScrollBehavior = "auto"): void {
  const root = getAppScrollRoot();
  if (root) {
    if (typeof root.scrollTo === "function") {
      root.scrollTo({ top: 0, behavior });
    } else {
      root.scrollTop = 0;
    }
    return;
  }
  if (typeof window !== "undefined") {
    const isJsdom =
      typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
    if (isJsdom) {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      return;
    }
    try {
      if (typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, behavior });
      } else {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    } catch {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }
}

export function useScrollReset(
  key: unknown,
  options: { enabled?: boolean; behavior?: ScrollBehavior } = {}
): void {
  const enabled = options.enabled ?? true;
  const behavior = options.behavior ?? "auto";

  useEffect(() => {
    if (!enabled) return;
    scrollAppToTop(behavior);
  }, [enabled, behavior, key]);
}
