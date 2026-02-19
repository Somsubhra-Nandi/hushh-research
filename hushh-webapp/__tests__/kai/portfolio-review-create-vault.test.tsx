import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/firebase/config", () => {
  return {
    app: {},
    auth: { currentUser: null },
    getRecaptchaVerifier: vi.fn(),
    resetRecaptcha: vi.fn(),
  };
});

vi.mock("@/hooks/use-auth", () => {
  return {
    useAuth: () => ({
      user: { uid: "uid-1" },
      loading: false,
      isAuthenticated: true,
    }),
  };
});

vi.mock("@/lib/vault/vault-context", () => {
  return {
    useVault: () => ({
      vaultKey: null,
      vaultOwnerToken: null,
      isVaultUnlocked: false,
    }),
  };
});

vi.mock("@/lib/services/vault-service", () => {
  return {
    VaultService: {
      checkVault: vi.fn(),
    },
  };
});

vi.mock("@/lib/services/world-model-service", () => {
  return {
    WorldModelService: {
      storeMergedDomain: vi.fn(),
      getDomainData: vi.fn(),
    },
  };
});

vi.mock("sonner", () => {
  return {
    toast: {
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("@/components/vault/vault-flow", () => {
  return {
    VaultFlow: ({ enableGeneratedDefault }: { enableGeneratedDefault?: boolean }) => (
      <div data-testid="vault-flow">
        {enableGeneratedDefault ? "generated-default-enabled" : "generated-default-disabled"}
      </div>
    ),
  };
});

import { VaultService } from "@/lib/services/vault-service";
import { PortfolioReviewView } from "@/components/kai/views/portfolio-review-view";

describe("PortfolioReviewView (create vault copy)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom sometimes lacks scrollTo; this component calls it on mount.
    (window as any).scrollTo = vi.fn();
  });

  it("shows 'Create vault' CTA when user has no vault, and opens vault dialog on click", async () => {
    (VaultService.checkVault as any).mockResolvedValue(false);

    render(
      <PortfolioReviewView
        portfolioData={{
          holdings: [
            {
              symbol: "TSLA",
              name: "Tesla",
              quantity: 1,
              price: 100,
              market_value: 100,
            },
          ],
        }}
        userId="uid-1"
        vaultKey="" // missing creds triggers vault dialog
        vaultOwnerToken={undefined}
        onSaveComplete={vi.fn()}
        onReimport={vi.fn()}
      />
    );

    const cta = await screen.findByRole("button", { name: /create vault/i });
    fireEvent.click(cta);

    const title = await screen.findByText(/create vault to save portfolio/i);
    expect(title).toBeTruthy();
    expect(screen.getByTestId("vault-flow")).toBeTruthy();
    expect(screen.getByText(/generated-default-enabled/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /skip for now/i })).toBeNull();
  });
});
