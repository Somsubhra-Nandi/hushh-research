import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

// Minimal mocks for Next primitives used by Navbar.
vi.mock("next/navigation", () => ({ usePathname: () => "/kai" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("@/components/consent/notification-provider", () => ({
  usePendingConsentCount: () => 0,
}));

vi.mock("@/lib/services/vault-service", () => ({
  VaultService: {
    checkVault: vi.fn(async () => false),
  },
}));

// Polyfill ResizeObserver for jsdom.
class MockResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe() {
    this.cb([], this as any);
  }
  unobserve() {}
  disconnect() {}
}

import { Navbar } from "@/components/navbar";

describe("Navbar bottom fixed UI offset", () => {
  const originalRO = (globalThis as any).ResizeObserver;
  const originalRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    (globalThis as any).ResizeObserver = MockResizeObserver as any;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          width: 320,
          height: 50,
          top: 0,
          left: 0,
          bottom: 50,
          right: 320,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as any
    );
  });

  afterEach(() => {
    (globalThis as any).ResizeObserver = originalRO;
    (HTMLElement.prototype.getBoundingClientRect as any).mockRestore?.();
    // Reset for other tests.
    document.documentElement.style.removeProperty("--app-bottom-fixed-ui");
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  it("sets --app-bottom-fixed-ui based on measured navbar height", () => {
    render(<Navbar />);
    const v = document.documentElement.style.getPropertyValue(
      "--app-bottom-fixed-ui"
    );
    // height 50 + gap 24 = 74px
    expect(v.trim()).toBe("74px");
  });
});
