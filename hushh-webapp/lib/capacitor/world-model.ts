/**
 * World Model Plugin Interface
 *
 * Supported TypeScript surface for the current world-model runtime contract.
 */

import { registerPlugin } from "@capacitor/core";

export interface HushhWorldModelPlugin {
  getMetadata(options: { userId: string; vaultOwnerToken?: string }): Promise<{
    userId: string;
    domains: Array<{
      key: string;
      displayName: string;
      icon: string;
      color: string;
      attributeCount: number;
      summary: Record<string, string | number>;
      availableScopes: string[];
      lastUpdated: string | null;
    }>;
    totalAttributes: number;
    modelCompleteness: number;
    suggestedDomains: string[];
    lastUpdated: string | null;
  }>;

  getAvailableScopes(options: {
    userId: string;
    vaultOwnerToken?: string;
  }): Promise<{
    userId: string;
    availableDomains: Array<{
      domain: string;
      displayName: string;
      scopes: string[];
    }>;
    allScopes: string[];
    wildcardScopes: string[];
  }>;

  getEncryptedData(options: {
    userId: string;
    vaultOwnerToken?: string;
  }): Promise<{
    ciphertext: string;
    iv: string;
    tag: string;
    algorithm?: string;
    data_version?: number;
    updated_at?: string;
  }>;

  storeDomainData(options: {
    userId: string;
    domain: string;
    encryptedBlob: {
      ciphertext: string;
      iv: string;
      tag: string;
      algorithm?: string;
    };
    summary: Record<string, unknown>;
    vaultOwnerToken?: string;
  }): Promise<{ success: boolean }>;

  getDomainData(options: {
    userId: string;
    domain: string;
    vaultOwnerToken?: string;
  }): Promise<{
    encrypted_blob?: {
      ciphertext: string;
      iv: string;
      tag: string;
      algorithm?: string;
    };
  }>;

  clearDomain(options: {
    userId: string;
    domain: string;
    vaultOwnerToken?: string;
  }): Promise<{ success: boolean }>;
}

export const HushhWorldModel = registerPlugin<HushhWorldModelPlugin>(
  "WorldModel",
  {
    web: () =>
      import("./plugins/world-model-web").then(
        (m) => new m.HushhWorldModelWeb()
      ),
  }
);
