import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/pre-vault-onboarding-service", () => ({
  PreVaultOnboardingService: {
    load: vi.fn(),
    markCompleted: vi.fn(),
    markSynced: vi.fn(),
  },
}));

vi.mock("@/lib/services/kai-profile-service", () => {
  return {
    computeRiskScore: vi.fn((answers: any) => {
      const scoreMap = {
        short_term: 0,
        medium_term: 1,
        long_term: 2,
        reduce: 0,
        stay: 1,
        buy_more: 2,
        small: 0,
        moderate: 1,
        large: 2,
      } as const;

      if (
        !answers?.investment_horizon ||
        !answers?.drawdown_response ||
        !answers?.volatility_preference
      ) {
        return null;
      }

      return (
        scoreMap[answers.investment_horizon as keyof typeof scoreMap] +
        scoreMap[answers.drawdown_response as keyof typeof scoreMap] +
        scoreMap[answers.volatility_preference as keyof typeof scoreMap]
      );
    }),
    mapRiskProfile: vi.fn((score: number) => {
      if (score <= 2) return "conservative";
      if (score <= 4) return "balanced";
      return "aggressive";
    }),
    KaiProfileService: {
      savePreferences: vi.fn(),
      setOnboardingCompleted: vi.fn(),
    },
  };
});

vi.mock("@/lib/services/kai-nav-tour-sync-service", () => ({
  KaiNavTourSyncService: {
    syncPendingToVault: vi.fn().mockResolvedValue({
      synced: false,
      reason: "no_pending_state",
    }),
  },
}));

import { PreVaultOnboardingService } from "@/lib/services/pre-vault-onboarding-service";
import { KaiProfileService } from "@/lib/services/kai-profile-service";
import { KaiProfileSyncService } from "@/lib/services/kai-profile-sync-service";

describe("KaiProfileSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs skipped onboarding by setting completion only", async () => {
    (PreVaultOnboardingService.load as any).mockResolvedValue({
      completed: true,
      skipped: true,
      synced_to_vault_at: null,
      answers: {
        investment_horizon: null,
        drawdown_response: null,
        volatility_preference: null,
      },
      risk_score: null,
      risk_profile: null,
    });

    const result = await KaiProfileSyncService.syncPendingToVault({
      userId: "uid-1",
      vaultKey: "key-1",
      vaultOwnerToken: "token-1",
    });

    expect(result.synced).toBe(true);
    expect(KaiProfileService.setOnboardingCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ skippedPreferences: true })
    );
    expect(KaiProfileService.savePreferences).not.toHaveBeenCalled();
    expect(PreVaultOnboardingService.markSynced).toHaveBeenCalledWith("uid-1");
  });

  it("syncs answered onboarding by saving preferences then completion", async () => {
    (PreVaultOnboardingService.load as any).mockResolvedValue({
      completed: true,
      skipped: false,
      synced_to_vault_at: null,
      answers: {
        investment_horizon: "long_term",
        drawdown_response: "buy_more",
        volatility_preference: "large",
      },
      risk_score: 6,
      risk_profile: "aggressive",
    });

    const result = await KaiProfileSyncService.syncPendingToVault({
      userId: "uid-2",
      vaultKey: "key-2",
      vaultOwnerToken: "token-2",
    });

    expect(result.synced).toBe(true);
    expect(KaiProfileService.savePreferences).toHaveBeenCalledTimes(1);
    expect(KaiProfileService.setOnboardingCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ skippedPreferences: false })
    );
    expect(PreVaultOnboardingService.markSynced).toHaveBeenCalledWith("uid-2");
  });

  it("does not mark synced when persistence fails", async () => {
    (PreVaultOnboardingService.load as any).mockResolvedValue({
      completed: true,
      skipped: false,
      synced_to_vault_at: null,
      answers: {
        investment_horizon: "medium_term",
        drawdown_response: "stay",
        volatility_preference: "moderate",
      },
      risk_score: 3,
      risk_profile: "balanced",
    });

    (KaiProfileService.savePreferences as any).mockRejectedValue(new Error("save failed"));

    await expect(
      KaiProfileSyncService.syncPendingToVault({
        userId: "uid-3",
        vaultKey: "key-3",
        vaultOwnerToken: "token-3",
      })
    ).rejects.toThrow("save failed");

    expect(PreVaultOnboardingService.markSynced).not.toHaveBeenCalled();
  });
});
