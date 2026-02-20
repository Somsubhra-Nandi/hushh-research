import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const routerPushMock = vi.fn();
const routerReplaceMock = vi.fn();
const routerMock = {
  push: routerPushMock,
  replace: routerReplaceMock,
};

const getMetadataMock = vi.fn();
const useScrollResetMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { uid: "uid-1" },
    loading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("@/lib/vault/vault-context", () => ({
  useVault: () => ({
    vaultKey: null,
    vaultOwnerToken: null,
  }),
}));

const cacheState = {
  getPortfolioData: vi.fn(() => null),
  setPortfolioData: vi.fn(),
  invalidateDomain: vi.fn(),
};

vi.mock("@/lib/cache/cache-context", () => ({
  useCache: () => cacheState,
}));

const kaiStore = {
  setBusyOperation: vi.fn(),
  busyOperations: {},
  setLosersInput: vi.fn(),
  setAnalysisParams: vi.fn(),
};

vi.mock("@/lib/stores/kai-session-store", () => ({
  useKaiSession: (selector: any) => selector(kaiStore),
}));

vi.mock("@/lib/services/world-model-service", () => ({
  WorldModelService: {
    getMetadata: (...args: any[]) => getMetadataMock(...args),
    loadFullBlob: vi.fn(),
    clearDomain: vi.fn(),
  },
}));

vi.mock("@/components/kai/views/portfolio-import-view", () => ({
  PortfolioImportView: () => <div>import-view</div>,
}));

vi.mock("@/components/kai/views/import-progress-view", () => ({
  ImportProgressView: () => <div>progress-view</div>,
}));

vi.mock("@/components/kai/views/portfolio-review-view", () => ({
  PortfolioReviewView: () => <div>review-view</div>,
}));

vi.mock("@/components/kai/views/dashboard-view", () => ({
  DashboardView: () => <div>dashboard-view</div>,
}));

vi.mock("@/components/kai/views/dashboard-master-view", () => ({
  DashboardMasterView: () => <div>dashboard-master-view</div>,
}));

vi.mock("@/components/kai/views/analysis-view", () => ({
  AnalysisView: () => <div>analysis-view</div>,
}));

vi.mock("@/components/kai/onboarding/KaiPreferencesSheet", () => ({
  KaiPreferencesSheet: () => null,
}));

vi.mock("@/components/vault/vault-flow", () => ({
  VaultFlow: () => null,
}));

vi.mock("@/lib/services/kai-service", () => ({
  getStockContext: vi.fn(),
}));

vi.mock("@/lib/services/api-service", () => ({
  ApiService: {
    importPortfolioStream: vi.fn(),
  },
}));

vi.mock("@/lib/streaming/kai-stream-client", () => ({
  consumeCanonicalKaiStream: vi.fn(),
}));

vi.mock("@/lib/navigation/use-scroll-reset", () => ({
  useScrollReset: (...args: any[]) => useScrollResetMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { KaiFlow } from "@/components/kai/kai-flow";

describe("KaiFlow scroll reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMetadataMock.mockResolvedValue({ domains: [] });
  });

  it("invokes scroll reset hook for initial and transitioned state keys", async () => {
    render(<KaiFlow userId="uid-1" mode="import" vaultOwnerToken="" />);

    expect(useScrollResetMock).toHaveBeenCalledWith("import:checking", {
      enabled: true,
      behavior: "auto",
    });

    await waitFor(() => {
      expect(useScrollResetMock).toHaveBeenCalledWith("import:import_required", {
        enabled: true,
        behavior: "auto",
      });
    });
  });
});
