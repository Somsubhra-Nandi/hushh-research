import { afterEach, describe, expect, it } from "vitest";

import { normalizeRpHost, resolvePasskeyRpId } from "@/lib/vault/passkey-rp";

const ORIGINAL_ENV = { ...process.env };

describe("passkey RP resolution", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("normalizes localhost aliases", () => {
    expect(normalizeRpHost("127.0.0.1")).toBe("localhost");
    expect(normalizeRpHost("LOCALHOST")).toBe("localhost");
  });

  it("prefers explicit NEXT_PUBLIC_PASSKEY_RP_ID", () => {
    process.env.NEXT_PUBLIC_PASSKEY_RP_ID = "vault.example.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://ignored.example.com";

    const rpId = resolvePasskeyRpId({
      isNative: true,
      hostname: "localhost",
    });

    expect(rpId).toBe("vault.example.com");
  });

  it("uses NEXT_PUBLIC_APP_URL host on native when RP ID is unset", () => {
    delete process.env.NEXT_PUBLIC_PASSKEY_RP_ID;
    process.env.NEXT_PUBLIC_APP_URL = "https://hushh-webapp.example.com";

    const rpId = resolvePasskeyRpId({
      isNative: true,
      hostname: "localhost",
    });

    expect(rpId).toBe("hushh-webapp.example.com");
  });

  it("uses runtime hostname on web and normalizes 127.0.0.1", () => {
    delete process.env.NEXT_PUBLIC_PASSKEY_RP_ID;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_FRONTEND_URL;

    const rpId = resolvePasskeyRpId({
      isNative: false,
      hostname: "127.0.0.1",
    });

    expect(rpId).toBe("localhost");
  });
});
