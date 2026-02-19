import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock("@/lib/capacitor", () => ({
  HushhKeychain: {
    isBiometricAvailable: vi.fn(async () => ({ available: false, type: "none" })),
    setBiometric: vi.fn(),
    getBiometric: vi.fn(),
  },
}));

vi.mock("@/lib/vault/prf-auth", () => ({
  checkBrowserSupport: vi.fn(),
  checkPrfSupport: vi.fn(),
  registerWithPrf: vi.fn(),
  authenticateWithPrf: vi.fn(),
}));

import { checkBrowserSupport, checkPrfSupport } from "@/lib/vault/prf-auth";
import { VaultBootstrapService } from "@/lib/services/vault-bootstrap-service";

describe("VaultBootstrapService.canUseGeneratedDefaultVault", () => {
  const checkBrowserSupportMock = vi.mocked(checkBrowserSupport);
  const checkPrfSupportMock = vi.mocked(checkPrfSupport);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unsupported on web when PRF/passkey is unavailable", async () => {
    checkBrowserSupportMock.mockReturnValue({
      supported: false,
      browser: "Firefox",
      reason: "Unsupported browser",
    });
    checkPrfSupportMock.mockResolvedValue(false);

    const result = await VaultBootstrapService.canUseGeneratedDefaultVault();

    expect(result.supported).toBe(false);
    if (!result.supported) {
      expect(result.reason).toMatch(/passkey/i);
    }
  });

  it("returns web PRF mode when browser and PRF support are available", async () => {
    checkBrowserSupportMock.mockReturnValue({
      supported: true,
      browser: "Chrome",
    });
    checkPrfSupportMock.mockResolvedValue(true);

    const result = await VaultBootstrapService.canUseGeneratedDefaultVault();

    expect(result).toEqual({
      supported: true,
      mode: "generated_default_web_prf",
    });
  });
});
