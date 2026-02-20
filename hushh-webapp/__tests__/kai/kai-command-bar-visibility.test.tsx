import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/kai/dashboard";
let authState = { user: { uid: "uid-1" }, loading: false };
let vaultState = { isVaultUnlocked: true };
let kaiStoreState = {
  setAnalysisParams: vi.fn(),
  setLosersInput: vi.fn(),
  busyOperations: {} as Record<string, boolean>,
};

const cacheGetMock = vi.fn();
const cacheSubscribeMock = vi.fn(() => () => undefined);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => pathname,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
  }),
}));

vi.mock("@/lib/vault/vault-context", () => ({
  useVault: () => ({
    isVaultUnlocked: vaultState.isVaultUnlocked,
  }),
}));

vi.mock("@/lib/stores/kai-session-store", () => ({
  useKaiSession: (selector: any) => selector(kaiStoreState),
}));

vi.mock("@/lib/services/cache-service", () => ({
  CacheService: {
    getInstance: () => ({
      get: cacheGetMock,
      subscribe: cacheSubscribeMock,
    }),
  },
  CACHE_KEYS: {
    PORTFOLIO_DATA: (uid: string) => `portfolio_data:${uid}`,
  },
}));

vi.mock("@/lib/morphy-ux/morphy", () => ({
  morphyToast: {
    info: vi.fn(),
  },
}));

vi.mock("@/components/kai/kai-search-bar", () => ({
  KaiSearchBar: (props: any) => (
    <div data-testid="kai-search-bar" data-has-portfolio={String(props.hasPortfolioData)} />
  ),
}));

import { KaiCommandBarGlobal } from "@/components/kai/kai-command-bar-global";

describe("KaiCommandBarGlobal visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = "/kai/dashboard";
    authState = { user: { uid: "uid-1" }, loading: false };
    vaultState = { isVaultUnlocked: true };
    kaiStoreState = {
      setAnalysisParams: vi.fn(),
      setLosersInput: vi.fn(),
      busyOperations: {},
    };
    cacheGetMock.mockReturnValue({ holdings: [{ symbol: "AAPL" }] });
  });

  it("hides command bar during review/save overlays", () => {
    kaiStoreState.busyOperations = {
      portfolio_review_active: true,
      portfolio_save: true,
    };

    render(<KaiCommandBarGlobal />);

    expect(screen.queryByTestId("kai-search-bar")).toBeNull();
  });

  it("renders command bar when vault is unlocked and no review overlay is active", () => {
    kaiStoreState.busyOperations = {};

    render(<KaiCommandBarGlobal />);

    const commandBar = screen.getByTestId("kai-search-bar");
    expect(commandBar).toBeTruthy();
    expect(commandBar.getAttribute("data-has-portfolio")).toBe("true");
  });
});
