/**
 * API Service - Platform-Aware API Routing
 *
 * Production-grade service that handles API calls across platforms:
 * - iOS: Routes to Cloud Run backend (static export has no API routes)
 * - Web: Routes to local Next.js API routes
 *
 * MIGRATION GUIDE:
 * ================
 * When adding new API routes to the Next.js app, follow this checklist:
 *
 * 1. Add the route to Next.js as usual (app/api/...)
 * 2. Add a corresponding method to this service
 * 3. If the route has complex logic, consider adding to native Swift plugin
 * 4. Test on both web AND iOS simulator
 *
 * For routes that need to work offline on iOS, use Capacitor plugins:
 * - VaultService → HushhVault plugin
 * - ConsentService → HushhConsent plugin
 * - AuthService → HushhAuth plugin
 */

import { Capacitor } from "@capacitor/core";
import { HushhVault, HushhAuth, HushhConsent, HushhNotifications } from "@/lib/capacitor";
import { Kai, PORTFOLIO_STREAM_EVENT, KAI_STREAM_EVENT } from "@/lib/capacitor/kai";
import { isKaiStreamEnvelope, type KaiStreamEnvelope } from "@/lib/streaming/kai-stream-types";
import { AuthService } from "@/lib/services/auth-service";

// API Base URL configuration
const getApiBaseUrl = (): string => {
  if (Capacitor.isNativePlatform()) {
    // iOS/Android: Use backendUrl (Cloud Run in prod, localhost in local dev).
    // IMPORTANT: Android emulator cannot reach host localhost; use 10.0.2.2.
    const raw =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "https://consent-protocol-1006304528804.us-central1.run.app";

    const normalized =
      Capacitor.getPlatform() === "android" && raw.includes("localhost")
        ? raw.replace("localhost", "10.0.2.2")
        : raw;

    return normalized.replace(/\/$/, "");
  }

// Web: Use relative paths (local Next.js server)
  return "";
};

// Direct Backend URL for streaming (bypasses Next.js proxy)
export const getDirectBackendUrl = (): string => {
  if (Capacitor.isNativePlatform()) {
    return getApiBaseUrl(); // Native already points to backend
  }

  // Allow override via environment variable (works in both dev and prod builds)
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL.replace(/\/$/, "");
  }

  // Default to localhost for flexibility (user can override for prod)
  return "http://localhost:8000";
};

const API_BASE = getApiBaseUrl();

/**
 * Platform-aware fetch wrapper
 * Automatically adds base URL and common headers
 *
 * Wrapped with API progress tracking so the route progress bar can reflect
 * real network activity across the app.
 */
async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE}${path}`;

  const defaultHeaders: HeadersInit =
    options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" };

  // Dynamically import tracker to avoid creating a hard dependency for environments
  // that don't care about progress (e.g., certain server-side usage).
  let trackStart: (() => void) | undefined;
  let trackEnd: (() => void) | undefined;
  try {
    const tracker = await import("../motion/api-progress-tracker");
    trackStart = tracker.trackRequestStart;
    trackEnd = tracker.trackRequestEnd;
  } catch {
    // If tracker cannot be loaded, we silently ignore and continue.
  }

  trackStart?.();
  try {
    const response = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });
    return response;
  } finally {
    trackEnd?.();
  }
}

export interface KaiHomeSparkPoint {
  t: number;
  p: number;
}

export interface KaiHomeHero {
  total_value: number | null;
  day_change_value: number | null;
  day_change_pct: number | null;
  sparkline_points: KaiHomeSparkPoint[];
  as_of: string | null;
  source_tags: string[];
  degraded: boolean;
  holdings_count?: number | null;
  portfolio_value_bucket?: string | null;
}

export interface KaiHomeWatchlistItem {
  symbol: string;
  symbol_quality?: string;
  company_name: string;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  market_cap: number | null;
  sector?: string | null;
  recommendation: string;
  recommendation_detail?: string | null;
  source_tags: string[];
  degraded: boolean;
  as_of: string | null;
}

export interface KaiHomeMover {
  symbol: string;
  company_name: string;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  source_tags: string[];
  degraded: boolean;
  as_of: string | null;
}

export interface KaiHomeMovers {
  gainers: KaiHomeMover[];
  losers: KaiHomeMover[];
  active: KaiHomeMover[];
  as_of: string | null;
  source_tags: string[];
  degraded: boolean;
}

export interface KaiHomeSectorItem {
  sector: string;
  change_pct: number | null;
  as_of: string | null;
  source_tags: string[];
  degraded: boolean;
}

export interface KaiHomeNewsItem {
  symbol: string;
  title: string;
  url: string;
  published_at: string;
  source_name: string;
  provider: string;
  sentiment_hint?: string | null;
  degraded: boolean;
}

export interface KaiHomeSignal {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  source_tags: string[];
  degraded: boolean;
}

export interface KaiHomeMeta {
  stale: boolean;
  stale_reason?: string;
  cache_age_seconds: number;
  cache_tier?: "memory" | "postgres" | "live";
  cache_hit?: boolean;
  warm_source?: "startup" | "unlock" | "request";
  provider_cooldowns?: Record<string, number>;
  provider_status: Record<string, string>;
  symbol_quality?: {
    requested_count: number;
    accepted_count: number;
    filtered_count: number;
  };
  filtered_symbols?: Array<{
    input_symbol: string;
    normalized_symbol: string;
    reason: string;
    trust_tier: string;
  }>;
}

export interface KaiHomeInsightsV2 {
  layout_version?: string;
  user_id?: string;
  generated_at?: string;
  stale?: boolean;
  stale_reason?: string;
  cache_age_seconds?: number;
  provider_status?: Record<string, string>;
  hero?: KaiHomeHero;
  watchlist?: KaiHomeWatchlistItem[];
  movers?: KaiHomeMovers;
  sector_rotation?: KaiHomeSectorItem[];
  news_tape?: KaiHomeNewsItem[];
  signals?: KaiHomeSignal[];
  meta?: KaiHomeMeta;
  // Backward-compatible fields still supported during transition.
  market_overview?: unknown[];
  spotlights?: unknown[];
  themes?: unknown[];
}

/**
 * API Service for platform-aware API calls
 */
export class ApiService {
  // ==================== Auth Helpers ====================

  /**
   * Get auth headers for API requests.
   * 
   * SECURITY: Token must be passed explicitly from useVault() hook.
   * Never reads from sessionStorage (XSS protection).
   * 
   * @param vaultOwnerToken - The VAULT_OWNER token (optional, for protected routes)
   * @returns HeadersInit object with Authorization header if token provided
   */
  static getAuthHeaders(vaultOwnerToken?: string): HeadersInit {
    return vaultOwnerToken ? { Authorization: `Bearer ${vaultOwnerToken}` } : {};
  }

  /**
   * Get the vault owner token.
   * 
   * DEPRECATED: Use useVault() hook directly in components.
   * This method exists only for backward compatibility.
   * 
   * @returns null - Token should be passed explicitly from useVault()
   */
  static getVaultOwnerToken(): string | null {
    console.warn("[ApiService] getVaultOwnerToken() is deprecated. Use useVault() hook and pass token explicitly.");
    return null;
  }

  /**
   * Platform-aware fetch wrapper (exposed for other services)
   * Automatically adds base URL and common headers
   */
  static async apiFetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    return apiFetch(path, options);
  }

  /**
   * Platform-aware fetch wrapper for Streaming/SSE
   * Returns the raw Response object for stream consumption.
   */
  static async apiFetchStream(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    return apiFetch(path, {
      ...options,
      headers: {
        ...options.headers,
        Accept: "text/event-stream",
      },
    });
  }

  /**
   * Get direct backend URL (bypassing proxy)
   */
  static getDirectBackendUrl(): string {
    return getDirectBackendUrl();
  }

  // ==================== App Config ====================

  /**
   * Runtime app-review-mode config served from backend env (not frontend build env).
   *
   * Web: hits Next.js proxy route `/api/app-config/review-mode`
   * Native: hits backend directly (API_BASE points at backend)
   */
  static async getAppReviewModeConfig(): Promise<{ enabled: boolean }> {
    try {
      const response = await apiFetch("/api/app-config/review-mode", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) return { enabled: false };

      const data = (await response.json().catch(() => ({}))) as {
        enabled?: unknown;
      };

      return { enabled: data.enabled === true };
    } catch (error) {
      console.warn("[ApiService] getAppReviewModeConfig failed:", error);
      return { enabled: false };
    }
  }

  /**
   * Request a backend-minted Firebase custom token for reviewer login.
   * Only available when app-review mode is enabled server-side.
   */
  static async createAppReviewModeSession(): Promise<{ token: string }> {
    const response = await apiFetch("/api/app-config/review-mode/session", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      const msg =
        (typeof payload.error === "string" && payload.error) ||
        (typeof payload.detail === "string" && payload.detail) ||
        "Reviewer login unavailable";
      throw new Error(msg);
    }

    const token = payload.token;
    if (typeof token !== "string" || token.length === 0) {
      throw new Error("Invalid reviewer session token");
    }

    return { token };
  }

  // ==================== Auth ====================

  /**
   * Create/update session
   */
  static async createSession(data: {
    userId: string;
    email: string;
    idToken?: string;
    displayName?: string;
    photoUrl?: string;
    emailVerified?: boolean;
    phoneNumber?: string;
  }): Promise<Response> {
    return apiFetch("/api/auth/session", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete session (logout)
   */
  static async deleteSession(): Promise<Response> {
    return apiFetch("/api/auth/session", {
      method: "DELETE",
    });
  }

  // ==================== Consent ====================

  /**
   * Get session token for consent protocol
   */
  static async getSessionToken(data: {
    userId: string;
    scope: string;
    agentId?: string;
  }): Promise<Response> {
    const firebaseIdToken = await this.getFirebaseToken();
    if (!firebaseIdToken) {
      return new Response(
        JSON.stringify({ error: "Missing Firebase ID token" }),
        { status: 401 }
      );
    }
    return apiFetch("/api/consent/session-token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firebaseIdToken}`,
      },
      body: JSON.stringify(data),
    });
  }

  /**
   * Logout from consent protocol
   */
  static async consentLogout(data: { token: string }): Promise<Response> {
    return apiFetch("/api/consent/logout", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Approve pending consent
   * Requires VAULT_OWNER token for authentication.
   */
  static async approvePendingConsent(data: {
    token?: string;
    requestId?: string;
    userId: string;
    vaultOwnerToken: string;
    encryptedData?: string;
    encryptedIv?: string;
    encryptedTag?: string;
    exportKey?: string;
  }): Promise<Response> {
    const requestId = data.requestId || data.token;
    const vaultOwnerToken = data.vaultOwnerToken;

    if (!vaultOwnerToken) {
      return new Response(
        JSON.stringify({ error: "Vault must be unlocked" }),
        { status: 401 }
      );
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const { HushhConsent } = await import("@/lib/capacitor");

        await HushhConsent.approve({
          requestId: requestId!,
          userId: data.userId,
          encryptedData: data.encryptedData,
          encryptedIv: data.encryptedIv,
          encryptedTag: data.encryptedTag,
          exportKey: data.exportKey,
          vaultOwnerToken,
        });

        return new Response(JSON.stringify({ success: true }), { status: 200 });
      } catch (e) {
        console.error("[ApiService] Native approvePendingConsent error:", e);
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
        });
      }
    }

    return apiFetch("/api/consent/pending/approve", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vaultOwnerToken}`,
      },
      body: JSON.stringify({
        userId: data.userId,
        requestId,
        encryptedData: data.encryptedData,
        encryptedIv: data.encryptedIv,
        encryptedTag: data.encryptedTag,
        exportKey: data.exportKey,
      }),
    });
  }

  /**
   * Deny pending consent
   * Requires VAULT_OWNER token for authentication.
   */
  static async denyPendingConsent(data: {
    token?: string;
    requestId?: string;
    userId: string;
    vaultOwnerToken: string;
  }): Promise<Response> {
    const requestId = data.requestId || data.token;
    const vaultOwnerToken = data.vaultOwnerToken;

    if (!vaultOwnerToken) {
      return new Response(
        JSON.stringify({ error: "Vault must be unlocked" }),
        { status: 401 }
      );
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const { HushhConsent } = await import("@/lib/capacitor");

        await HushhConsent.deny({
          requestId: requestId!,
          userId: data.userId,
          vaultOwnerToken,
        });

        return new Response(JSON.stringify({ success: true }), { status: 200 });
      } catch (e) {
        console.error("[ApiService] Native denyPendingConsent error:", e);
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
        });
      }
    }

    return apiFetch("/api/consent/pending/deny", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vaultOwnerToken}`,
      },
      body: JSON.stringify({ userId: data.userId, requestId }),
    });
  }

  /**
   * Revoke consent
   * Route: POST /api/consent/revoke
   */
  static async revokeConsent(data: {
    token: string;
    userId: string;
    scope?: string;
  }): Promise<Response> {
    const vaultOwnerToken = data.token;
    if (!vaultOwnerToken) {
      return new Response(
        JSON.stringify({ error: "Vault must be unlocked" }),
        { status: 401 }
      );
    }

    // Scope is required by backend. On native we enforce + normalize to prevent
    // silent failures (e.g. sending scope="").
    const rawScope = (data.scope || "").trim();
    if (!rawScope) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: scope" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const normalizedScope =
      rawScope === "VAULT_OWNER" || rawScope === "ConsentScope.VAULT_OWNER"
        ? "vault.owner"
        : rawScope;

    if (Capacitor.isNativePlatform()) {
      try {
        // Use revokeConsent that calls the backend and returns lockVault flag
        const result = await HushhConsent.revokeConsent({
          userId: data.userId,
          scope: normalizedScope,
          vaultOwnerToken,
        });

        // Pass through the lockVault flag from native plugin response
        return new Response(
          JSON.stringify({ 
            success: true, 
            lockVault: result.lockVault ?? false 
          }), 
          { status: 200 }
        );
      } catch (e) {
        console.error("[ApiService] Native revokeConsent error:", e);
        return new Response((e as Error).message || "Failed", { status: 500 });
      }
    }

    return apiFetch("/api/consent/revoke", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vaultOwnerToken}`,
      },
      body: JSON.stringify({ ...data, scope: normalizedScope }),
    });
  }

  /**
   * Get pending consent requests
   * Route: GET /api/consent/pending?userId=xxx
   * Requires VAULT_OWNER token for authentication.
   */
  static async getPendingConsents(
    userId: string,
    vaultOwnerToken: string
  ): Promise<Response> {
    if (!vaultOwnerToken) {
      return new Response(
        JSON.stringify({ error: "Vault must be unlocked" }),
        { status: 401 }
      );
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const { consents } = await HushhConsent.getPending({
          userId,
          vaultOwnerToken,
        });
        return new Response(JSON.stringify({ pending: consents || [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.warn("[ApiService] Native getPendingConsents error:", e);
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
        });
      }
    }
    return apiFetch(
      `/api/consent/pending?userId=${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${vaultOwnerToken}`,
        },
      }
    );
  }

  /**
   * Register push notification token (FCM/APNs) for consent notifications.
   * Route: POST /api/notifications/register
   * Requires Firebase ID token in Authorization (Bearer).
   */
  static async registerPushToken(
    userId: string,
    token: string,
    platform: "web" | "ios" | "android",
    idToken: string
  ): Promise<Response> {
    if (Capacitor.isNativePlatform()) {
      try {
        const backendUrl = this.getDirectBackendUrl();
        const result = await HushhNotifications.registerPushToken({
          userId,
          token,
          platform,
          idToken,
          backendUrl,
        });
        return new Response(JSON.stringify(result), {
          status: result.success ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.warn("[ApiService] Native registerPushToken error:", e);
        return new Response(
          JSON.stringify({ error: (e as Error).message || "Native error" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    return apiFetch("/api/notifications/register", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        user_id: userId,
        token,
        platform,
      }),
    });
  }

  /**
   * Unregister push notification tokens (logout flow).
   * Route: DELETE /api/notifications/unregister
   */
  static async unregisterPushToken(
    userId: string,
    idToken: string,
    platform?: "web" | "ios" | "android"
  ): Promise<Response> {
    if (Capacitor.isNativePlatform()) {
      try {
        const backendUrl = this.getDirectBackendUrl();
        const result = await HushhNotifications.unregisterPushToken({
          userId,
          idToken,
          ...(platform ? { platform } : {}),
          backendUrl,
        });
        return new Response(JSON.stringify(result), {
          status: result.success ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.warn("[ApiService] Native unregisterPushToken error:", e);
        return new Response(
          JSON.stringify({ error: (e as Error).message || "Native error" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    return apiFetch("/api/notifications/unregister", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        user_id: userId,
        ...(platform ? { platform } : {}),
      }),
    });
  }

  /**
   * Get active consents
   * Route: GET /api/consent/active?userId=xxx
   */
  static async getActiveConsents(
    userId: string,
    vaultOwnerToken: string
  ): Promise<Response> {
    if (!vaultOwnerToken) {
      return new Response(
        JSON.stringify({ error: "Vault must be unlocked" }),
        { status: 401 }
      );
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const { consents } = await HushhConsent.getActive({
          userId,
          vaultOwnerToken,
        });
        return new Response(JSON.stringify({ active: consents || [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.warn("[ApiService] Native getActiveConsents error:", e);
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
        });
      }
    }
    
    return apiFetch(`/api/consent/active?userId=${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${vaultOwnerToken}`,
      },
    });
  }

  /**
   * Get consent history/audit log
   * Route: GET /api/consent/history?userId=xxx&page=1&limit=50
   */
  static async getConsentHistory(
    userId: string,
    vaultOwnerToken: string,
    page: number = 1,
    limit: number = 50
  ): Promise<Response> {
    if (!vaultOwnerToken) {
      return new Response(
        JSON.stringify({ error: "Vault must be unlocked" }),
        { status: 401 }
      );
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const { items } = await HushhConsent.getHistory({
          userId,
          vaultOwnerToken,
          page,
          limit,
        });
        return new Response(JSON.stringify({ items: items || [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        console.warn("[ApiService] Native getConsentHistory error:", e);
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
        });
      }
    }
    return apiFetch(
      `/api/consent/history?userId=${encodeURIComponent(
        userId
      )}&page=${page}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${vaultOwnerToken}`,
        },
      }
    );
  }

  /**
   * Cancel consent request
   * Route: POST /api/consent/cancel
   */
  static async cancelConsent(data: {
    userId: string;
    requestId: string;
  }): Promise<Response> {
    return apiFetch("/api/consent/cancel", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ==================== Vault ====================
  // Mirrors: /api/vault/* routes

  /**
   * Check if user has a vault
   * Route: GET /api/vault/check?userId=xxx
   */
  static async checkVault(userId: string): Promise<Response> {
    return apiFetch(`/api/vault/check?userId=${encodeURIComponent(userId)}`);
  }

  /**
   * Get vault key data
   * Route: GET /api/vault/get?userId=xxx
   */
  static async getVault(userId: string): Promise<Response> {
    return apiFetch(`/api/vault/get?userId=${encodeURIComponent(userId)}`);
  }

  /**
   * Setup vault for new user
   * Route: POST /api/vault/setup
   */
  static async setupVault(data: {
    userId: string;
    authMethod?: string;
    encryptedVaultKey: string;
    salt: string;
    iv: string;
    recoveryEncryptedVaultKey: string;
    recoverySalt: string;
    recoveryIv: string;
  }): Promise<Response> {
    return apiFetch("/api/vault/setup", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Get vault status (domain counts without encrypted data)
   * Requires VAULT_OWNER token
   *
   * Platform routing:
   * - Native: Direct backend call → /db/vault/status
   * - Web: Next.js proxy → Backend
   *
   * Route: GET /api/vault/status (web) or POST /db/vault/status (native)
   */
  static async getVaultStatus(
    userId: string,
    vaultOwnerToken: string
  ): Promise<Response> {
    if (Capacitor.isNativePlatform()) {
      try {
        // Native: Prefer plugin proxy to avoid fetch/env/cert inconsistencies
        const authToken = await this.getFirebaseToken();
        if (!authToken) {
          return new Response(
            JSON.stringify({ error: "Missing Firebase auth token" }),
            { status: 401 }
          );
        }

        const result = await HushhVault.getVaultStatus({
          userId,
          vaultOwnerToken,
          authToken,
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("[ApiService] Native getVaultStatus error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    // Web: Use Next.js proxy
    const firebaseIdToken = await this.getFirebaseToken();
    if (!firebaseIdToken) {
      return new Response(
        JSON.stringify({ error: "Missing Firebase ID token" }),
        { status: 401 }
      );
    }
    return apiFetch("/api/vault/status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firebaseIdToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, consentToken: vaultOwnerToken }),
    });
  }

  /**
   * Store preferences to vault (generic)
   * Route: POST /api/vault/store-preferences
   */
  static async storePreferences(data: {
    userId: string;
    domain?: string;
    preferences: Record<string, any>;
    consentToken: string;
  }): Promise<Response> {
    if (Capacitor.isNativePlatform()) {
      try {
        const authToken = await this.getFirebaseToken();
        const promises = [];

        // Iterate through all preference keys and store them individually
        // This maps to the /api/$domain/preferences/store endpoint via the plugin
        for (const [key, value] of Object.entries(data.preferences)) {
          const domain = data.domain || "general";
          promises.push(
            HushhVault.storePreferencesToCloud({
              userId: data.userId,
              domain: domain,
              fieldName: key,
              ciphertext: value.ciphertext,
              iv: value.iv,
              tag: value.tag || "",
              consentToken: data.consentToken,
              authToken: authToken,
            })
          );
        }

        await Promise.all(promises);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      } catch (e) {
        console.error("❌ [ApiService] Native storePreferences error:", e);
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
        });
      }
    }

    return apiFetch("/api/vault/store-preferences", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ==================== Chat/Agents ====================

  /**
   * Send message to chat agent
   */
  static async sendChatMessage(data: {
    message: string;
    userId: string;
    agentId?: string;
    sessionState?: Record<string, unknown>;
  }): Promise<Response> {
    return apiFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ==================== Helpers ====================

  /**
   * Get the configured API base URL
   */
  static getBaseUrl(): string {
    return API_BASE;
  }

  static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  // Helper to get Firebase ID Token for Native calls
  private static async getFirebaseToken(): Promise<string | undefined> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { idToken } = await HushhAuth.getIdToken();
        return idToken || undefined;
      } catch (e) {
        console.warn("[ApiService] Failed to get native ID token:", e);
      }
    } else {
      const token = await AuthService.getIdToken().catch(() => null);
      return token || undefined;
    }
    return undefined;
  }

  // ==================== Kai Agent Methods ====================

  /**
   * Grant Kai Consent
   */
  static async kaiGrantConsent(data: {
    userId: string;
    scopes?: string[];
  }): Promise<Response> {
    // Updated to use dynamic attr.* scopes instead of legacy vault.read.*/vault.write.*
    const scopes = data.scopes || [
      "attr.financial.risk_profile",  // Replaces vault.read.risk_profile
      "agent.kai.analyze",
    ];

    const authToken = await this.getFirebaseToken();
    if (!authToken) {
      return new Response(JSON.stringify({ error: "Missing Firebase ID token" }), {
        status: 401,
      });
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Kai.grantConsent({
          userId: data.userId,
          scopes,
          authToken,
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("[ApiService] Native kaiGrantConsent error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    return apiFetch("/api/kai/consent/grant", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ user_id: data.userId, scopes }),
    });
  }

  /**
   * Analyze stock ticker
   */
  static async kaiAnalyze(data: {
    userId: string;
    ticker: string;
    consentToken: string;
    riskProfile: string;
    processingMode: string;
  }): Promise<Response> {
    if (Capacitor.isNativePlatform()) {
      try {
        const vaultOwnerToken = this.getVaultOwnerToken() || undefined;
        const result = await Kai.analyze({
          userId: data.userId,
          ticker: data.ticker,
          consentToken: data.consentToken,
          riskProfile: data.riskProfile,
          processingMode: data.processingMode,
          vaultOwnerToken,
        });

        return new Response(JSON.stringify(result.decision), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("[ApiService] Native kaiAnalyze error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    const vaultOwnerToken = this.getVaultOwnerToken();
    if (!vaultOwnerToken) {
      return new Response(JSON.stringify({ error: "Vault must be unlocked" }), {
        status: 401,
      });
    }

    return apiFetch("/api/kai/analyze", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vaultOwnerToken}`,
      },
      body: JSON.stringify({
        user_id: data.userId,
        ticker: data.ticker,
        consent_token: data.consentToken,
        risk_profile: data.riskProfile,
        processing_mode: data.processingMode,
      }),
    });
  }

  /**
   * Send message to Kai chat agent
   *
   * This is the primary method for conversational interaction with Kai.
   * Supports persistent chat history and insertable UI components.
   *
   * Authentication: Requires VAULT_OWNER token (consent-first architecture).
   */
  static async sendKaiMessage(data: {
    userId: string;
    message: string;
    conversationId?: string;
    vaultOwnerToken: string;
  }): Promise<Response> {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Kai.chat({
          userId: data.userId,
          message: data.message,
          conversationId: data.conversationId,
          vaultOwnerToken: data.vaultOwnerToken,
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("[ApiService] Native sendKaiMessage error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    // Web: Use VAULT_OWNER token for consent-gated access
    return apiFetch("/api/kai/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.vaultOwnerToken}`,
      },
      body: JSON.stringify({
        user_id: data.userId,
        message: data.message,
        conversation_id: data.conversationId,
      }),
    });
  }

  /**
   * Import portfolio from brokerage statement
   *
   * Accepts CSV or PDF files and returns portfolio analysis with losers.
   * Uses the Kai plugin for tri-flow architecture compliance.
   *
   * Authentication: Requires VAULT_OWNER token (consent-first architecture).
   */
  /**
   * Import portfolio via streaming endpoint (SSE).
   * Tri-flow compliant: use this instead of direct fetch() in components.
   */
  static async importPortfolioStream(params: {
    formData: FormData;
    vaultOwnerToken: string;
    signal?: AbortSignal;
  }): Promise<Response> {
    const headers: HeadersInit = {
      Authorization: `Bearer ${params.vaultOwnerToken}`,
      Accept: "text/event-stream",
    };

    // Native: use Kai plugin for real-time SSE (WKWebView buffers fetch() response body)
    if (Capacitor.isNativePlatform()) {
      try {
        const file = params.formData.get("file") as File;
        const userId = params.formData.get("user_id") as string;
        if (!file || !userId) {
          return new Response(
            JSON.stringify({ error: "Missing file or user_id in formData" }),
            { status: 400 }
          );
        }
        const fileBase64 = await this.fileToBase64(file);
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let sawTerminalEvent = false;
            let closed = false;
            let listener: { remove: () => void } | null = null;

            const cleanup = () => {
              if (listener) {
                listener.remove();
                listener = null;
              }
            };
            const close = () => {
              if (closed) return;
              closed = true;
              cleanup();
              controller.close();
            };
            const fail = (error: unknown) => {
              if (closed) return;
              closed = true;
              cleanup();
              controller.error(
                error instanceof Error ? error : new Error(String(error))
              );
            };
            const handleAbort = () => {
              fail(new DOMException("Aborted", "AbortError"));
            };

            try {
              params.signal?.addEventListener("abort", handleAbort, { once: true });
              listener = await Kai.addListener(
                PORTFOLIO_STREAM_EVENT,
                (event: Record<string, unknown>) => {
                  if (closed) return;
                  const eventType =
                    typeof event.event === "string" ? event.event : null;
                  const envelopeCandidate = event.data;
                  if (!eventType || !isKaiStreamEnvelope(envelopeCandidate)) {
                    fail(new Error("Invalid native portfolio stream event"));
                    return;
                  }

                  const envelope = envelopeCandidate as KaiStreamEnvelope;
                  if (envelope.event !== eventType) {
                    fail(new Error("Native SSE event mismatch"));
                    return;
                  }

                  controller.enqueue(
                    encoder.encode(
                      `event: ${eventType}\ndata: ${JSON.stringify(envelope)}\n\n`
                    )
                  );

                  if (envelope.terminal) {
                    sawTerminalEvent = true;
                  }
                }
              );

              await Kai.streamPortfolioImport({
                userId,
                fileBase64,
                fileName: file.name,
                mimeType: file.type || "application/octet-stream",
                vaultOwnerToken: params.vaultOwnerToken,
              });

              if (!sawTerminalEvent) {
                fail(new Error("Native import stream ended without terminal event"));
                return;
              }
              close();
            } catch (error) {
              fail(error);
            } finally {
              params.signal?.removeEventListener("abort", handleAbort);
            }
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      } catch (error) {
        console.error("[ApiService] Native importPortfolioStream error:", error);
        throw error;
      }
    }

    // Web: use Next.js proxy
    return apiFetch("/api/kai/portfolio/import/stream", {
      method: "POST",
      body: params.formData,
      headers,
      signal: params.signal,
    });
  }

  static async importPortfolio(data: {
    userId: string;
    file: File;
    vaultOwnerToken: string;
  }): Promise<Response> {
    // Use VAULT_OWNER token for consent-gated access
    if (!data.vaultOwnerToken) {
      return new Response(
        JSON.stringify({ error: "Vault must be unlocked to import portfolio" }),
        { status: 401 }
      );
    }

    try {
      // Convert File to base64 for plugin compatibility
      const fileBase64 = await this.fileToBase64(data.file);

      // Import the Kai plugin
      const { Kai } = await import("@/lib/capacitor/kai");

      // Use Kai plugin for both web and native (tri-flow compliant)
      const result = await Kai.importPortfolio({
        userId: data.userId,
        fileBase64,
        fileName: data.file.name,
        mimeType: data.file.type || "application/octet-stream",
        vaultOwnerToken: data.vaultOwnerToken,
      });

      // Wrap result in Response for backward compatibility
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[ApiService] importPortfolio error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: (error as Error).message,
        }),
        { status: 500 }
      );
    }
  }

  /**
   * Convert a File object to base64 string
   */
  private static async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:application/pdf;base64,")
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Get portfolio summary from world model
   */
  static async getPortfolioSummary(data: {
    userId: string;
    vaultOwnerToken: string;
  }): Promise<Response> {
    if (Capacitor.isNativePlatform()) {
      try {
        const vaultOwnerToken = data.vaultOwnerToken;
        if (!vaultOwnerToken) {
          return new Response(
            JSON.stringify({ error: "Vault must be unlocked" }),
            { status: 401 }
          );
        }

        const response = await fetch(`${API_BASE}/api/kai/portfolio/summary/${data.userId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${vaultOwnerToken}`,
          },
        });

        return response;
      } catch (error) {
        console.error("[ApiService] Native getPortfolioSummary error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    return apiFetch(`/api/kai/portfolio/summary/${data.userId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${data.vaultOwnerToken}`,
      },
    });
  }

  /**
   * Fetch cached live market insights for Kai home.
   */
  static async getKaiMarketInsights(data: {
    userId: string;
    vaultOwnerToken: string;
    symbols?: string[];
    daysBack?: number;
    signal?: AbortSignal;
  }): Promise<KaiHomeInsightsV2> {
    const query = new URLSearchParams();
    if (Array.isArray(data.symbols) && data.symbols.length > 0) {
      query.set("symbols", data.symbols.join(","));
    }
    if (typeof data.daysBack === "number" && Number.isFinite(data.daysBack)) {
      query.set("days_back", String(data.daysBack));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const path = `/api/kai/market/insights/${data.userId}${suffix}`;

    if (Capacitor.isNativePlatform()) {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "GET",
        signal: data.signal,
        headers: {
          Authorization: `Bearer ${data.vaultOwnerToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to load market insights: ${response.status}`);
      }
      return (await response.json()) as KaiHomeInsightsV2;
    }

    const response = await apiFetch(path, {
      method: "GET",
      signal: data.signal,
      headers: {
        Authorization: `Bearer ${data.vaultOwnerToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to load market insights: ${response.status}`);
    }
    return (await response.json()) as KaiHomeInsightsV2;
  }

  /**
   * Analyze a portfolio loser
   */
  static async analyzeLoser(data: {
    userId: string;
    symbol: string;
    conversationId?: string;
    vaultOwnerToken: string;
  }): Promise<Response> {
    const body = {
      user_id: data.userId,
      symbol: data.symbol,
      conversation_id: data.conversationId,
    };

    if (Capacitor.isNativePlatform()) {
      try {
        const vaultOwnerToken = data.vaultOwnerToken;
        if (!vaultOwnerToken) {
          return new Response(
            JSON.stringify({ error: "Vault must be unlocked" }),
            { status: 401 }
          );
        }

        const response = await fetch(`${API_BASE}/api/kai/chat/analyze-loser`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${vaultOwnerToken}`,
          },
          body: JSON.stringify(body),
        });

        return response;
      } catch (error) {
        console.error("[ApiService] Native analyzeLoser error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    return apiFetch("/api/kai/chat/analyze-loser", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.vaultOwnerToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Analyze portfolio losers (criteria-first) using Renaissance rubric.
   *
   * IMPORTANT: Backend does not persist full holdings (BYOK). Caller must provide
   * loser positions computed client-side from the imported portfolio data.
   */
  static async analyzePortfolioLosers(data: {
    userId: string;
    losers: Array<{
      symbol: string;
      name?: string;
      gain_loss_pct?: number;
      gain_loss?: number;
      market_value?: number;
    }>;
    thresholdPct?: number;
    maxPositions?: number;
    vaultOwnerToken: string;
    holdings?: Array<{
      symbol: string;
      name?: string;
      gain_loss_pct?: number;
      gain_loss?: number;
      market_value?: number;
      sector?: string;
      asset_type?: string;
    }>;
    forceOptimize?: boolean;
    userPreferences?: Record<string, unknown>;
  }): Promise<Response> {
    const body = {
      user_id: data.userId,
      losers: data.losers,
      threshold_pct: data.thresholdPct ?? -5.0,
      max_positions: data.maxPositions ?? 10,
      holdings: data.holdings,
      force_optimize: data.forceOptimize,
      user_preferences: data.userPreferences,
    };

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Kai.analyzePortfolioLosers({
          userId: data.userId,
          losers: data.losers,
          thresholdPct: body.threshold_pct,
          maxPositions: body.max_positions,
          vaultOwnerToken: data.vaultOwnerToken,
        });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("[ApiService] Native analyzePortfolioLosers error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    return apiFetch("/api/kai/portfolio/analyze-losers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.vaultOwnerToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Streaming version of portfolio losers analysis with AI reasoning.
   * 
   * Returns a Response with SSE stream that emits:
   * - 'stage' events: Current processing stage
   * - 'thinking' events: AI reasoning/thought summaries
   * - 'chunk' events: Partial response text
   * - 'complete' events: Final parsed JSON result
   * - 'error' events: Error messages
   * 
   * @example
   * const response = await ApiService.analyzePortfolioLosersStream({...});
   * const reader = response.body?.getReader();
   * const decoder = new TextDecoder();
   * while (true) {
   *   const { done, value } = await reader.read();
   *   if (done) break;
   *   const text = decoder.decode(value);
   *   // Parse SSE events from text
   * }
   */
  static async analyzePortfolioLosersStream(data: {
    userId: string;
    losers: Array<{
      symbol: string;
      name?: string;
      gain_loss_pct?: number;
      gain_loss?: number;
      market_value?: number;
    }>;
    thresholdPct?: number;
    maxPositions?: number;
    vaultOwnerToken: string;
    holdings?: Array<{
      symbol: string;
      name?: string;
      gain_loss_pct?: number;
      gain_loss?: number;
      market_value?: number;
      sector?: string;
      asset_type?: string;
    }>;
    forceOptimize?: boolean;
    userPreferences?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<Response> {
    const body = {
      user_id: data.userId,
      losers: data.losers,
      threshold_pct: data.thresholdPct ?? -5.0,
      max_positions: data.maxPositions ?? 10,
      holdings: data.holdings,
      force_optimize: data.forceOptimize,
      user_preferences: data.userPreferences,
    };

    // Native: use Kai plugin for real-time SSE (WKWebView buffers fetch() response body)
    if (Capacitor.isNativePlatform()) {
      try {
        const vaultOwnerToken = data.vaultOwnerToken;
        if (!vaultOwnerToken) {
          return new Response(
            JSON.stringify({ error: "Vault must be unlocked" }),
            { status: 401 }
          );
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let sawTerminalEvent = false;
            let closed = false;
            let listener: { remove: () => void } | null = null;

            const cleanup = () => {
              if (listener) {
                listener.remove();
                listener = null;
              }
            };
            const close = () => {
              if (closed) return;
              closed = true;
              cleanup();
              controller.close();
            };
            const fail = (error: unknown) => {
              if (closed) return;
              closed = true;
              cleanup();
              controller.error(
                error instanceof Error ? error : new Error(String(error))
              );
            };
            const handleAbort = () => {
              fail(new DOMException("Aborted", "AbortError"));
            };

            try {
              data.signal?.addEventListener("abort", handleAbort, { once: true });
              listener = await Kai.addListener(
                PORTFOLIO_STREAM_EVENT,
                (event: Record<string, unknown>) => {
                  if (closed) return;
                  const eventType =
                    typeof event.event === "string" ? event.event : null;
                  const envelopeCandidate = event.data;
                  if (!eventType || !isKaiStreamEnvelope(envelopeCandidate)) {
                    fail(new Error("Invalid native optimize stream event"));
                    return;
                  }

                  const envelope = envelopeCandidate as KaiStreamEnvelope;
                  if (envelope.event !== eventType) {
                    fail(new Error("Native SSE event mismatch"));
                    return;
                  }

                  controller.enqueue(
                    encoder.encode(
                      `event: ${eventType}\ndata: ${JSON.stringify(envelope)}\n\n`
                    )
                  );

                  if (envelope.terminal) {
                    sawTerminalEvent = true;
                  }
                }
              );

              await Kai.streamPortfolioAnalyzeLosers({
                body: body as Record<string, unknown>,
                vaultOwnerToken,
              });

              if (!sawTerminalEvent) {
                fail(new Error("Native optimize stream ended without terminal event"));
                return;
              }
              close();
            } catch (error) {
              fail(error);
            } finally {
              data.signal?.removeEventListener("abort", handleAbort);
            }
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      } catch (error) {
        console.error("[ApiService] Native analyzePortfolioLosersStream error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    // For web, use the Next.js proxy
    return apiFetch("/api/kai/portfolio/analyze-losers/stream", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.vaultOwnerToken}`,
      },
      body: JSON.stringify(body),
      signal: data.signal,
    });
  }

  /**
   * Analyze a stock using Kai's 3-agent investment committee
   * 
   * Returns a decision card with buy/hold/reduce recommendation.
   */
  static async analyzeStock(data: {
    userId: string;
    ticker: string;
    riskProfile?: "conservative" | "balanced" | "aggressive";
    context?: Record<string, unknown>;
    vaultOwnerToken: string;
  }): Promise<Response> {
    const body = {
      user_id: data.userId,
      ticker: data.ticker.toUpperCase(),
      risk_profile: data.riskProfile || "balanced",
      processing_mode: "hybrid",
      context: data.context,
    };

    if (Capacitor.isNativePlatform()) {
      try {
        const vaultOwnerToken = data.vaultOwnerToken;
        if (!vaultOwnerToken) {
          return new Response(
            JSON.stringify({ error: "Vault must be unlocked" }),
            { status: 401 }
          );
        }

        // Use the native Kai plugin (consistent with Tri-Flow and avoids WebView networking quirks).
        const result = await Kai.analyze({
          userId: data.userId,
          ticker: data.ticker.toUpperCase(),
          // Backend still expects consent_token in body for some routes; plugin supports it.
          consentToken: "",
          riskProfile: body.risk_profile,
          processingMode: body.processing_mode,
          context: data.context,
          vaultOwnerToken,
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("[ApiService] Native analyzeStock error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    return apiFetch("/api/kai/analyze", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.vaultOwnerToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Stream Kai stock analysis with real-time SSE events
   * 
   * Returns a Response with SSE stream that emits:
   * - 'agent_start' events: Agent begins analysis
   * - 'agent_token' events: Streaming tokens showing AI thinking
   * - 'agent_complete' events: Agent finished with summary
   * - 'debate_round' events: Each round of agent debate
   * - 'decision' events: Final decision card
   * - 'error' events: Error messages
   * 
   * SSE Format from Backend:
   * event: agent_start
   * data: {"event": "agent_start", "data": {"agent": "..."}, "id": "..."}
   * 
   * Native Kai plugin uses different format, we normalize to SSE standard.
   */
  static async streamKaiAnalysis(data: {
    userId: string;
    ticker: string;
    riskProfile: string;
    userContext?: any;
    vaultOwnerToken: string;
    signal?: AbortSignal;
  }): Promise<Response> {
    const body = {
      user_id: data.userId,
      ticker: data.ticker.toUpperCase(),
      risk_profile: data.riskProfile,
      context: data.userContext,
    };

    // Native: use Kai plugin and expose a ReadableStream of SSE text
    if (Capacitor.isNativePlatform()) {
      try {
        const vaultOwnerToken = data.vaultOwnerToken;
        if (!vaultOwnerToken) {
          return new Response(
            JSON.stringify({ error: "Vault must be unlocked" }),
            { status: 401 }
          );
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let sawTerminalEvent = false;
            let closed = false;
            let listener: { remove: () => void } | null = null;

            const cleanup = () => {
              if (listener) {
                listener.remove();
                listener = null;
              }
            };
            const close = () => {
              if (closed) return;
              closed = true;
              cleanup();
              controller.close();
            };
            const fail = (error: unknown) => {
              if (closed) return;
              closed = true;
              cleanup();
              controller.error(
                error instanceof Error ? error : new Error(String(error))
              );
            };
            const handleAbort = () => {
              fail(new DOMException("Aborted", "AbortError"));
            };

            try {
              data.signal?.addEventListener("abort", handleAbort, { once: true });
              listener = await Kai.addListener(
                KAI_STREAM_EVENT,
                (event: Record<string, unknown>) => {
                  if (closed) return;
                  const eventType =
                    typeof event.event === "string" ? event.event : null;
                  const envelopeCandidate = event.data;
                  if (!eventType || !isKaiStreamEnvelope(envelopeCandidate)) {
                    fail(new Error("Invalid native analyze stream event"));
                    return;
                  }

                  const envelope = envelopeCandidate as KaiStreamEnvelope;
                  if (envelope.event !== eventType) {
                    fail(new Error("Native SSE event mismatch"));
                    return;
                  }

                  if (envelope.terminal) {
                    sawTerminalEvent = true;
                  }

                  controller.enqueue(
                    encoder.encode(
                      `event: ${eventType}\ndata: ${JSON.stringify(envelope)}\n\n`
                    )
                  );
                }
              );

              await Kai.streamKaiAnalysis({
                body: body as Record<string, unknown>,
                vaultOwnerToken,
              });

              if (!sawTerminalEvent) {
                fail(new Error("Native analyze stream ended without terminal event"));
                return;
              }
              close();
            } catch (error) {
              fail(error);
            } finally {
              data.signal?.removeEventListener("abort", handleAbort);
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      } catch (error) {
        console.error("[ApiService] Native streamKaiAnalysis error:", error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
          status: 500,
        });
      }
    }

    // For web, use the Next.js proxy
    return apiFetch("/api/kai/analyze/stream", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.vaultOwnerToken}`,
      },
      body: JSON.stringify(body),
      signal: data.signal,
    });
  }
}

// Re-export for convenience
export { getApiBaseUrl };
