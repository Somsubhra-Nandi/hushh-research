import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/vault/vault-context", () => ({
  useVault: () => ({
    unlockVault: vi.fn(),
  }),
}));

vi.mock("@/lib/services/vault-service", () => ({
  VaultService: {
    checkVault: vi.fn(),
    canUseGeneratedDefaultVault: vi.fn(),
    createVault: vi.fn(),
    setupVault: vi.fn(),
    setVaultCheckCache: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import { VaultService } from "@/lib/services/vault-service";
import { VaultFlow } from "@/components/vault/vault-flow";

describe("VaultFlow generated-default fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to passphrase setup on web when PRF/passkey is unavailable", async () => {
    (VaultService.checkVault as any).mockResolvedValue(false);
    (VaultService.canUseGeneratedDefaultVault as any).mockResolvedValue({
      supported: false,
      reason: "Passkey/PRF unavailable",
    });

    const onSuccess = vi.fn();

    render(
      <VaultFlow
        user={{ uid: "uid-1", displayName: "User" } as any}
        onSuccess={onSuccess}
        enableGeneratedDefault
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/secure your digital vault/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /not now \(use secure default key\)/i }));

    await waitFor(() => {
      expect(screen.getByText(/create your vault passphrase/i)).toBeTruthy();
    });

    expect(VaultService.canUseGeneratedDefaultVault).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

