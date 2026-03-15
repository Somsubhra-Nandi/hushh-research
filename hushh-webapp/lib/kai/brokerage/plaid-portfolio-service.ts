"use client";

import { CacheSyncService } from "@/lib/cache/cache-sync-service";
import { ApiService } from "@/lib/services/api-service";
import type {
  PlaidPortfolioStatusResponse,
  PortfolioSource,
} from "@/lib/kai/brokerage/portfolio-sources";

export interface PlaidLinkTokenResponse {
  configured: boolean;
  mode: string;
  link_token: string | null;
  expiration?: string | null;
  redirect_uri?: string | null;
  request_id?: string | null;
  resume_session_id?: string | null;
}

export interface PlaidRefreshResponse {
  accepted: boolean;
  runs: Array<Record<string, unknown>>;
}

async function extractPlaidError(response: Response, fallback: string): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const payload = (raw ? JSON.parse(raw) : null) as
      | {
          detail?: string | Record<string, unknown> | null;
          message?: string | null;
          error?: string | null;
          details?: string | null;
        }
      | null;
    const detail =
      payload?.detail && typeof payload.detail === "object" && !Array.isArray(payload.detail)
        ? (payload.detail as Record<string, unknown>)
        : null;
    const detailPayload =
      detail?.payload && typeof detail.payload === "object" && !Array.isArray(detail.payload)
        ? (detail.payload as Record<string, unknown>)
        : null;
    const candidates = [
      typeof detail?.display_message === "string" ? detail.display_message : null,
      typeof detail?.message === "string" ? detail.message : null,
      typeof detailPayload?.error_message === "string" ? detailPayload.error_message : null,
      typeof payload?.message === "string" ? payload.message : null,
      typeof payload?.error === "string" ? payload.error : null,
      typeof payload?.details === "string" ? payload.details : null,
      typeof payload?.detail === "string" ? payload.detail : null,
      raw && !raw.trim().startsWith("<") ? raw : null,
    ];
    const message = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
    return message?.trim() || fallback;
  } catch {
    return raw && !raw.trim().startsWith("<") ? raw.trim() : fallback;
  }
}

export class PlaidPortfolioService {
  static async getStatus(params: {
    userId: string;
    vaultOwnerToken: string;
  }): Promise<PlaidPortfolioStatusResponse> {
    const response = await ApiService.apiFetch(
      `/api/kai/plaid/status/${encodeURIComponent(params.userId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${params.vaultOwnerToken}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to load Plaid portfolio status: ${response.status}`);
    }
    return (await response.json()) as PlaidPortfolioStatusResponse;
  }

  static async createLinkToken(params: {
    userId: string;
    vaultOwnerToken: string;
    itemId?: string;
    updateMode?: boolean;
    redirectUri?: string;
  }): Promise<PlaidLinkTokenResponse> {
    const path = params.updateMode
      ? "/api/kai/plaid/link-token/update"
      : "/api/kai/plaid/link-token";
    const response = await ApiService.apiFetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.vaultOwnerToken}`,
      },
      body: JSON.stringify({
        user_id: params.userId,
        item_id: params.itemId,
        redirect_uri: params.redirectUri || null,
      }),
    });
    if (!response.ok) {
      const detail = await extractPlaidError(
        response,
        "Plaid could not start the connection flow right now."
      );
      throw new Error(detail);
    }
    return (await response.json()) as PlaidLinkTokenResponse;
  }

  static async exchangePublicToken(params: {
    userId: string;
    publicToken: string;
    vaultOwnerToken: string;
    metadata?: Record<string, unknown> | null;
    resumeSessionId?: string | null;
  }): Promise<PlaidPortfolioStatusResponse> {
    const response = await ApiService.apiFetch("/api/kai/plaid/exchange-public-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.vaultOwnerToken}`,
      },
      body: JSON.stringify({
        user_id: params.userId,
        public_token: params.publicToken,
        metadata: params.metadata || null,
        resume_session_id: params.resumeSessionId || null,
      }),
    });
    if (!response.ok) {
      const detail = await extractPlaidError(
        response,
        "Plaid could not finish connecting this brokerage."
      );
      throw new Error(detail);
    }
    const payload = (await response.json()) as PlaidPortfolioStatusResponse;
    CacheSyncService.onPlaidSourceProjected(params.userId);
    return payload;
  }

  static async refresh(params: {
    userId: string;
    vaultOwnerToken: string;
    itemId?: string;
  }): Promise<PlaidRefreshResponse> {
    const response = await ApiService.apiFetch("/api/kai/plaid/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.vaultOwnerToken}`,
      },
      body: JSON.stringify({
        user_id: params.userId,
        item_id: params.itemId,
      }),
    });
    if (!response.ok) {
      const detail = await extractPlaidError(
        response,
        "Plaid could not refresh this brokerage right now."
      );
      throw new Error(detail);
    }
    return (await response.json()) as PlaidRefreshResponse;
  }

  static async resumeOAuth(params: {
    userId: string;
    resumeSessionId: string;
    vaultOwnerToken: string;
  }): Promise<PlaidLinkTokenResponse> {
    const response = await ApiService.apiFetch("/api/kai/plaid/oauth/resume", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.vaultOwnerToken}`,
      },
      body: JSON.stringify({
        user_id: params.userId,
        resume_session_id: params.resumeSessionId,
      }),
    });
    if (!response.ok) {
      const detail = await extractPlaidError(
        response,
        "Plaid could not resume this brokerage connection."
      );
      throw new Error(detail);
    }
    return (await response.json()) as PlaidLinkTokenResponse;
  }

  static async getRefreshRun(params: {
    userId: string;
    runId: string;
    vaultOwnerToken: string;
  }): Promise<{ run: Record<string, unknown> }> {
    const query = new URLSearchParams({ user_id: params.userId }).toString();
    const response = await ApiService.apiFetch(
      `/api/kai/plaid/refresh/${encodeURIComponent(params.runId)}?${query}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${params.vaultOwnerToken}`,
        },
      }
    );
    if (!response.ok) {
      const detail = await extractPlaidError(
        response,
        "Plaid refresh status is not available right now."
      );
      throw new Error(detail);
    }
    return (await response.json()) as { run: Record<string, unknown> };
  }

  static async cancelRefreshRun(params: {
    userId: string;
    runId: string;
    vaultOwnerToken: string;
  }): Promise<{ run: Record<string, unknown> }> {
    const response = await ApiService.apiFetch(
      `/api/kai/plaid/refresh/${encodeURIComponent(params.runId)}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.vaultOwnerToken}`,
        },
        body: JSON.stringify({
          user_id: params.userId,
        }),
      }
    );
    if (!response.ok) {
      const detail = await extractPlaidError(
        response,
        "Plaid could not cancel this refresh right now."
      );
      throw new Error(detail);
    }
    return (await response.json()) as { run: Record<string, unknown> };
  }

  static async setActiveSource(params: {
    userId: string;
    activeSource: PortfolioSource;
    vaultOwnerToken: string;
  }): Promise<{ user_id: string; active_source: PortfolioSource }> {
    const response = await ApiService.apiFetch("/api/kai/plaid/source", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.vaultOwnerToken}`,
      },
      body: JSON.stringify({
        user_id: params.userId,
        active_source: params.activeSource,
      }),
    });
    if (!response.ok) {
      const detail = await extractPlaidError(
        response,
        "Kai could not switch the portfolio source."
      );
      throw new Error(detail);
    }
    return (await response.json()) as { user_id: string; active_source: PortfolioSource };
  }
}
