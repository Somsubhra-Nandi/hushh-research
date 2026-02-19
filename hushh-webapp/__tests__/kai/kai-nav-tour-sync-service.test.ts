import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/kai-nav-tour-local-service", () => ({
  KaiNavTourLocalService: {
    load: vi.fn(),
    markSynced: vi.fn(),
  },
}));

vi.mock("@/lib/services/kai-profile-service", () => ({
  KaiProfileService: {
    setNavTourState: vi.fn(),
  },
}));

import { KaiNavTourLocalService } from "@/lib/services/kai-nav-tour-local-service";
import { KaiProfileService } from "@/lib/services/kai-profile-service";
import { KaiNavTourSyncService } from "@/lib/services/kai-nav-tour-sync-service";

describe("KaiNavTourSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs completed nav tour into kai_profile", async () => {
    (KaiNavTourLocalService.load as any).mockResolvedValue({
      completed_at: "2026-02-19T00:00:00.000Z",
      skipped_at: null,
      synced_to_vault_at: null,
    });

    const result = await KaiNavTourSyncService.syncPendingToVault({
      userId: "uid-1",
      vaultKey: "vault-key",
      vaultOwnerToken: "token",
    });

    expect(result.synced).toBe(true);
    expect(KaiProfileService.setNavTourState).toHaveBeenCalledWith(
      expect.objectContaining({ completedAt: "2026-02-19T00:00:00.000Z" })
    );
    expect(KaiNavTourLocalService.markSynced).toHaveBeenCalledWith("uid-1");
  });

  it("returns no_pending_state when local tour state is absent", async () => {
    (KaiNavTourLocalService.load as any).mockResolvedValue(null);

    const result = await KaiNavTourSyncService.syncPendingToVault({
      userId: "uid-2",
      vaultKey: "vault-key",
      vaultOwnerToken: "token",
    });

    expect(result).toEqual({ synced: false, reason: "no_pending_state" });
    expect(KaiProfileService.setNavTourState).not.toHaveBeenCalled();
  });
});
