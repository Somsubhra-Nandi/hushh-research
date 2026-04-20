// hushh-webapp/lib/services/account-service.ts
import { Capacitor } from "@capacitor/core";
import { HushhAccount } from "@/lib/capacitor";
import { apiJson } from "./api-client";
import { trackEvent } from "@/lib/observability/client";

export type AccountDeletionTarget = "investor" | "ria" | "both";

export interface AccountDeletionResult {
  success: boolean;
  message?: string;
  requested_target?: AccountDeletionTarget;
  deleted_target?: AccountDeletionTarget;
  account_deleted?: boolean;
  remaining_personas?: Array<"investor" | "ria">;
  details?: Record<string, unknown>;
}

export interface AccountExportResult {
  schema_version: number;
  exported_at: string;
  user_id: string;
  actor_profile: {
    personas: string[];
    last_active_persona: string;
    investor_marketplace_opt_in: boolean;
    created_at: string | null;
    updated_at: string | null;
  } | null;
  pkm_index: {
    available_domains: string[];
    computed_tags: string[];
    domain_summaries: Record<string, unknown>;
    activity_score: number | null;
    last_active_at: string | null;
    total_attributes: number;
    model_version: number;
    updated_at: string | null;
  } | null;
  vault_metadata: {
    primary_method: string;
    wrapper_count: number;
    note: string;
    created_at: string | null;
    updated_at: string | null;
  } | null;
  pkm_manifests: Array<{
    domain: string;
    path: string;
    version: number;
    updated_at: string | null;
  }>;
  pkm_scope_registry: Array<{
    scope: string;
    granted_at: string | null;
    expires_at: string | null;
  }>;
}

export class AccountServiceImpl {
  /**
   * Delete the user's account and all data.
   * Requires VAULT_OWNER token (Unlock to Delete).
   * 
   * SECURITY: Token must be passed explicitly from useVault() hook.
   * Never reads from sessionStorage (XSS protection).
   * 
   * @param vaultOwnerToken - The VAULT_OWNER consent token (REQUIRED)
   */
  async deleteAccount(
    vaultOwnerToken: string,
    target: AccountDeletionTarget = "both"
  ): Promise<AccountDeletionResult> {
    if (!vaultOwnerToken) {
      throw new Error("VAULT_OWNER token required - vault must be unlocked");
    }
    
    trackEvent("account_delete_requested", {
      result: "success",
    });

    console.log(
      "[AccountService] Deleting account with target:",
      target,
      "token:",
      vaultOwnerToken.substring(0, 30) + "..."
    );

    try {
      if (Capacitor.isNativePlatform()) {
        // Native: Call Capacitor plugin directly to Python backend
        const result = await HushhAccount.deleteAccount({
          authToken: vaultOwnerToken,
          target,
        });
        trackEvent("account_delete_completed", {
          result: result.success ? "success" : "error",
          status_bucket: result.success ? "2xx" : "5xx",
        });
        return result;
      } else {
        // Web: Call Next.js proxy
        const result = await apiJson<AccountDeletionResult>(
          "/api/account/delete",
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${vaultOwnerToken}`,
            },
            body: JSON.stringify({ target }),
          }
        );
        trackEvent("account_delete_completed", {
          result: result.success ? "success" : "error",
          status_bucket: result.success ? "2xx" : "5xx",
        });
        return result;
      }
    } catch (error) {
      console.error("Account deletion failed:", error);
      trackEvent("account_delete_completed", {
        result: "error",
        status_bucket: "5xx",
      });
      throw error;
    }
  }

  /**
   * Export all user data as a portable JSON bundle.
   *
   * Requires VAULT_OWNER token (vault must be unlocked to export).
   *
   * BYOK guarantee: raw vault key material is never included.
   * The returned bundle is automatically downloaded as a .json file
   * on web. On native, the JSON string is returned for the caller
   * to handle via the platform share sheet.
   *
   * @param vaultOwnerToken - The VAULT_OWNER consent token (REQUIRED)
   * @returns AccountExportResult — the full portable data bundle
   */
  async exportData(vaultOwnerToken: string): Promise<AccountExportResult> {
    if (!vaultOwnerToken) {
      throw new Error("VAULT_OWNER token required - vault must be unlocked");
    }

    trackEvent("account_export_requested", {});

    try {
      const result = await apiJson<AccountExportResult>(
        "/api/account/export",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${vaultOwnerToken}`,
          },
        }
      );

      trackEvent("account_export_completed", { result: "success" });

      // On web: trigger a browser download automatically.
      if (!Capacitor.isNativePlatform() && typeof window !== "undefined") {
        const json = JSON.stringify(result, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `hushh-export-${result.exported_at.slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }

      return result;
    } catch (error) {
      console.error("Account export failed:", error);
      trackEvent("account_export_completed", { result: "error" });
      throw error;
    }
  }
}

export const AccountService = new AccountServiceImpl();