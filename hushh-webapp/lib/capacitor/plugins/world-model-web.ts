/**
 * World Model Web Implementation
 *
 * Web fallback for the supported world-model proxy surface.
 */

import { WebPlugin } from "@capacitor/core";
import type { HushhWorldModelPlugin } from "@/lib/capacitor/world-model";

export class HushhWorldModelWeb
  extends WebPlugin
  implements HushhWorldModelPlugin
{
  private async getAuthHeader(overrideToken?: string): Promise<string> {
    return overrideToken ? `Bearer ${overrideToken}` : "";
  }

  async getMetadata(options: {
    userId: string;
    vaultOwnerToken?: string;
  }): Promise<{
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
  }> {
    const response = await fetch(`/api/world-model/metadata/${options.userId}`, {
      headers: {
        Authorization: await this.getAuthHeader(options.vaultOwnerToken),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get metadata: ${response.status}`);
    }

    const data = await response.json();

    return {
      userId: data.user_id,
      domains: (data.domains || []).map((d: Record<string, unknown>) => ({
        key: (d.domain_key || d.key) as string,
        displayName: (d.display_name || d.displayName) as string,
        icon: (d.icon_name || d.icon) as string,
        color: (d.color_hex || d.color) as string,
        attributeCount: (d.attribute_count || d.attributeCount) as number,
        summary: (d.summary || {}) as Record<string, string | number>,
        availableScopes: (d.available_scopes || []) as string[],
        lastUpdated: (d.last_updated || null) as string | null,
      })),
      totalAttributes: data.total_attributes || 0,
      modelCompleteness: data.model_completeness || 0,
      suggestedDomains: data.suggested_domains || [],
      lastUpdated: data.last_updated,
    };
  }

  async getAvailableScopes(options: {
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
  }> {
    const response = await fetch(`/api/world-model/scopes/${options.userId}`, {
      headers: {
        Authorization: await this.getAuthHeader(options.vaultOwnerToken),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get scopes: ${response.status}`);
    }

    const data = await response.json();

    return {
      userId: data.user_id,
      availableDomains: data.available_domains || [],
      allScopes: data.all_scopes || [],
      wildcardScopes: data.wildcard_scopes || [],
    };
  }

  async getEncryptedData(options: {
    userId: string;
    vaultOwnerToken?: string;
  }): Promise<{
    ciphertext: string;
    iv: string;
    tag: string;
    algorithm?: string;
    data_version?: number;
    updated_at?: string;
  }> {
    const response = await fetch(`/api/world-model/data/${options.userId}`, {
      headers: {
        Authorization: await this.getAuthHeader(options.vaultOwnerToken),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get encrypted data: ${response.status}`);
    }

    return response.json();
  }

  async storeDomainData(options: {
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
  }): Promise<{ success: boolean }> {
    const response = await fetch("/api/world-model/store-domain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: await this.getAuthHeader(options.vaultOwnerToken),
      },
      body: JSON.stringify({
        user_id: options.userId,
        domain: options.domain,
        encrypted_blob: {
          ciphertext: options.encryptedBlob.ciphertext,
          iv: options.encryptedBlob.iv,
          tag: options.encryptedBlob.tag,
          algorithm: options.encryptedBlob.algorithm || "aes-256-gcm",
        },
        summary: options.summary,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to store domain data: ${response.status}`);
    }

    return response.json();
  }

  async getDomainData(options: {
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
  }> {
    const response = await fetch(
      `/api/world-model/domain-data/${options.userId}/${options.domain}`,
      {
        headers: {
          Authorization: await this.getAuthHeader(options.vaultOwnerToken),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get domain data: ${response.status}`);
    }

    return response.json();
  }

  async clearDomain(options: {
    userId: string;
    domain: string;
    vaultOwnerToken?: string;
  }): Promise<{ success: boolean }> {
    const response = await fetch(
      `/api/world-model/domain-data/${options.userId}/${options.domain}`,
      {
        method: "DELETE",
        headers: {
          Authorization: await this.getAuthHeader(options.vaultOwnerToken),
        },
      }
    );

    return { success: response.ok };
  }
}
