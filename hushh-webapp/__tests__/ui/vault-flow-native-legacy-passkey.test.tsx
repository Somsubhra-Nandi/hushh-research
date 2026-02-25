import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => ({})),
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => "ios"),
  },
}));

vi.mock("@/lib/vault/vault-context", () => ({
  useVault: () => ({
    unlockVault: vi.fn(),
  }),
}));

vi.mock("@/lib/services/vault-service", () => ({
  VaultService: {
    checkVault: vi.fn(),
    getVaultState: vi.fn(),
    getPrimaryWrapper: vi.fn(
      (state: { wrappers?: Array<{ method?: string }> } | undefined) =>
        state?.wrappers?.[0] ?? null
    ),
    getWrapperByMethod: vi.fn(
      (
        state: { wrappers?: Array<{ method?: string; wrapperId?: string; passkeyRpId?: string }> } | undefined,
        method: string
      ) => state?.wrappers?.find((wrapper) => wrapper?.method === method) ?? null
    ),
  },
}));

import { VaultService } from "@/lib/services/vault-service";
import { VaultFlow } from "@/components/vault/vault-flow";

describe("VaultFlow native legacy web PRF fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forces passphrase fallback and shows enrollment hint on native", async () => {
    const checkVaultMock = vi.mocked(VaultService.checkVault);
    const getVaultStateMock = vi.mocked(VaultService.getVaultState);
    const mockUser = {
      uid: "uid-legacy",
      displayName: "Legacy User",
    } as unknown as User;

    checkVaultMock.mockResolvedValue(true);
    getVaultStateMock.mockResolvedValue({
      vaultKeyHash: "hash-1",
      primaryMethod: "generated_default_web_prf",
      primaryWrapperId: "legacy-web-cred",
      recoveryEncryptedVaultKey: "r1",
      recoverySalt: "r2",
      recoveryIv: "r3",
      wrappers: [
        {
          method: "generated_default_web_prf",
          wrapperId: "legacy-web-cred",
          encryptedVaultKey: "e1",
          salt: "s1",
          iv: "i1",
          passkeyCredentialId: "legacy-web-cred",
          passkeyPrfSalt: "salt",
          passkeyRpId: "legacy.example.com",
        },
        {
          method: "passphrase",
          wrapperId: "default",
          encryptedVaultKey: "e2",
          salt: "s2",
          iv: "i2",
        },
      ],
    });

    render(
      <VaultFlow
        user={mockUser}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/unlock your vault/i)).toBeTruthy();
    });

    expect(
      screen.getByText(/use passphrase once and enroll passkey for this device\/domain/i)
    ).toBeTruthy();
    expect(screen.getByLabelText(/passphrase/i)).toBeTruthy();
    expect(screen.queryByText(/prompting passkey/i)).toBeNull();
  });
});
