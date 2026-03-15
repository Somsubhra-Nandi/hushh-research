// hushh-webapp/lib/services/world-model-service.ts
/**
 * World Model Service - Frontend service for world model operations.
 *
 * Provides platform-aware methods for:
 * - Fetching user metadata
 * - Storing encrypted domain data blobs (BYOK)
 * - Scope validation
 *
 * Tri-Flow Compliant: Uses HushhWorldModel plugin on native, ApiService.apiFetch() on web.
 * 
 * IMPORTANT: This service MUST NOT use direct fetch("/api/...") calls.
 * All web requests go through ApiService.apiFetch() for consistent auth handling.
 * 
 * Caching: Uses CacheService for in-memory caching with TTL to reduce API calls.
 */

import { Capacitor } from "@capacitor/core";
import { HushhWorldModel } from "@/lib/capacitor";
import { CacheSyncService } from "@/lib/cache/cache-sync-service";
import type { PortfolioData as CachedPortfolioData } from "@/lib/cache/cache-context";
import { ApiService } from "./api-service";
import { CacheService, CACHE_KEYS, CACHE_TTL } from "./cache-service";

// ==================== Types ====================

export interface DomainSummary {
  key: string;
  displayName: string;
  icon: string;
  color: string;
  attributeCount: number;
  summary: Record<string, string | number>;
  availableScopes: string[];
  lastUpdated: string | null;
}

export interface WorldModelMetadata {
  userId: string;
  domains: DomainSummary[];
  totalAttributes: number;
  modelCompleteness: number;
  suggestedDomains: string[];
  lastUpdated: string | null;
}

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  tag: string;
  algorithm?: string;
}

export interface EncryptedUserBlob extends EncryptedValue {
  dataVersion?: number;
  updatedAt?: string;
}

export interface StoreDomainDataResult {
  success: boolean;
  conflict?: boolean;
  message?: string;
  dataVersion?: number;
  updatedAt?: string;
}

type DecryptedFullBlobCacheEntry = {
  marker: string;
  blob: Record<string, unknown>;
};

export interface ScopeDiscovery {
  userId: string;
  availableDomains: {
    domain: string;
    displayName: string;
    scopes: string[];
  }[];
  allScopes: string[];
  wildcardScopes: string[];
}

// ==================== Service ====================

export class WorldModelService {
  private static metadataInflight = new Map<string, Promise<WorldModelMetadata>>();
  private static encryptedDataInflight = new Map<string, Promise<EncryptedUserBlob | null>>();
  private static domainDataInflight = new Map<string, Promise<EncryptedValue | null>>();
  private static tickerSyncInflight = new Map<string, Promise<void>>();
  private static tickerSyncSignatureByUser = new Map<string, string>();
  private static tickerSyncLastAt = new Map<string, number>();
  private static readonly TICKER_SYNC_THROTTLE_MS = 5 * 60 * 1000;

  private static inflightKey(
    keyParts: Array<string | number | boolean | undefined | null>
  ): string {
    return keyParts.map((part) => (part ?? "null").toString()).join(":");
  }

  private static cloneRecord<T extends Record<string, unknown>>(value: T): T {
    if (typeof globalThis.structuredClone === "function") {
      try {
        return globalThis.structuredClone(value) as T;
      } catch {
        // Fall through to JSON clone.
      }
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private static buildEncryptedBlobMarker(blob: EncryptedUserBlob | EncryptedValue): string {
    const updatedAt =
      "updatedAt" in blob && typeof blob.updatedAt === "string" ? blob.updatedAt : "na";
    const dataVersion =
      "dataVersion" in blob && typeof blob.dataVersion === "number" ? blob.dataVersion : "na";
    const ciphertext = blob.ciphertext || "";
    const ciphertextSignature = `${ciphertext.length}:${ciphertext.slice(0, 24)}:${ciphertext.slice(-24)}`;
    return [
      blob.algorithm || "aes-256-gcm",
      dataVersion,
      updatedAt,
      blob.iv,
      blob.tag,
      ciphertextSignature,
    ].join("|");
  }

  private static cacheDecryptedBlob(params: {
    userId: string;
    encryptedBlob: EncryptedUserBlob | EncryptedValue;
    fullBlob: Record<string, unknown>;
  }): void {
    const cache = CacheService.getInstance();
    const cacheKey = CACHE_KEYS.WORLD_MODEL_DECRYPTED_BLOB(params.userId);
    const entry: DecryptedFullBlobCacheEntry = {
      marker: this.buildEncryptedBlobMarker(params.encryptedBlob),
      blob: this.cloneRecord(params.fullBlob),
    };
    cache.set(cacheKey, entry, CACHE_TTL.SESSION);
  }

  static peekCachedEncryptedBlob(userId: string): EncryptedUserBlob | null {
    const cache = CacheService.getInstance();
    const cacheKey = CACHE_KEYS.WORLD_MODEL_BLOB(userId);
    const cached = cache.get<EncryptedUserBlob>(cacheKey);
    if (!cached) return null;
    return { ...cached };
  }

  static peekCachedFullBlob(userId: string): {
    blob: Record<string, unknown>;
    dataVersion?: number;
    updatedAt?: string;
  } | null {
    const cache = CacheService.getInstance();
    const decryptedCacheKey = CACHE_KEYS.WORLD_MODEL_DECRYPTED_BLOB(userId);
    const cachedDecrypted = cache.get<DecryptedFullBlobCacheEntry>(decryptedCacheKey);
    if (!cachedDecrypted?.blob) {
      return null;
    }

    const cachedEncrypted = this.peekCachedEncryptedBlob(userId);
    if (cachedEncrypted) {
      const marker = this.buildEncryptedBlobMarker(cachedEncrypted);
      if (cachedDecrypted.marker !== marker) {
        return null;
      }
    }

    return {
      blob: this.cloneRecord(cachedDecrypted.blob),
      dataVersion: cachedEncrypted?.dataVersion,
      updatedAt: cachedEncrypted?.updatedAt,
    };
  }

  private static isLikelyPortfolioData(value: unknown): value is CachedPortfolioData {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const record = value as Record<string, unknown>;
    const portfolio = record.portfolio;
    if (portfolio && typeof portfolio === "object" && !Array.isArray(portfolio)) {
      const portfolioRecord = portfolio as Record<string, unknown>;
      return Array.isArray(portfolioRecord.holdings);
    }
    return false;
  }

  private static resolvePortfolioDataForDomain(params: {
    domain: string;
    domainData: Record<string, unknown>;
  }): CachedPortfolioData | undefined {
    if (params.domain !== "financial" || !this.isLikelyPortfolioData(params.domainData)) {
      return undefined;
    }

    const domainRecord = params.domainData as Record<string, unknown>;
    if (Array.isArray(domainRecord.holdings)) {
      return params.domainData as CachedPortfolioData;
    }
    if (
      domainRecord.portfolio &&
      typeof domainRecord.portfolio === "object" &&
      !Array.isArray(domainRecord.portfolio)
    ) {
      return domainRecord.portfolio as CachedPortfolioData;
    }
    return undefined;
  }

  private static normalizeHoldingSymbolCandidate(value: unknown): string {
    const raw = String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9.\-]/g, "");
    if (!raw) return "";
    if (["CASH", "MMF", "SWEEP", "QACDS"].includes(raw)) return "CASH";
    if (!/^[A-Z][A-Z0-9.\-]{0,5}$/.test(raw)) return "";
    return raw;
  }

  private static extractHoldingsForTickerSync(fullBlob: Record<string, unknown>): Array<Record<string, unknown>> {
    const financial =
      fullBlob.financial && typeof fullBlob.financial === "object" && !Array.isArray(fullBlob.financial)
        ? (fullBlob.financial as Record<string, unknown>)
        : null;
    if (!financial) return [];

    const canonicalPortfolio =
      financial.portfolio &&
      typeof financial.portfolio === "object" &&
      !Array.isArray(financial.portfolio)
        ? (financial.portfolio as Record<string, unknown>)
        : null;

    const holdingsSource = Array.isArray(canonicalPortfolio?.holdings)
      ? canonicalPortfolio?.holdings
      : Array.isArray(financial.holdings)
        ? financial.holdings
        : [];

    if (!Array.isArray(holdingsSource)) return [];

    const out: Array<Record<string, unknown>> = [];
    for (const row of holdingsSource) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        continue;
      }
      const holding = row as Record<string, unknown>;
      const symbol = this.normalizeHoldingSymbolCandidate(
        holding.symbol ??
          holding.ticker ??
          holding.ticker_symbol ??
          holding.display_ticker ??
          holding.security_symbol
      );
      if (!symbol) continue;
      out.push({
        symbol,
        ticker: symbol,
        name: holding.name ?? holding.description ?? holding.title ?? holding.company_name ?? symbol,
        sector: holding.sector ?? holding.sector_primary ?? holding.asset_category ?? holding.asset_type,
        industry: holding.industry ?? holding.industry_primary,
        asset_type: holding.asset_type ?? holding.asset_class ?? holding.instrument_kind,
        security_listing_status: holding.security_listing_status,
        instrument_kind: holding.instrument_kind,
        is_cash_equivalent: holding.is_cash_equivalent,
        is_investable: holding.is_investable,
      });
      if (out.length >= 250) {
        break;
      }
    }
    return out;
  }

  private static async maybeSyncTickersFromFinancialBlob(params: {
    userId: string;
    fullBlob: Record<string, unknown>;
    vaultOwnerToken?: string;
  }): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      return;
    }
    if (!params.vaultOwnerToken) {
      return;
    }

    const holdings = this.extractHoldingsForTickerSync(params.fullBlob);
    if (!holdings.length) {
      return;
    }

    const signature = holdings
      .map((row) => String(row.symbol || ""))
      .filter(Boolean)
      .sort()
      .join(",");
    if (!signature) {
      return;
    }

    const now = Date.now();
    const priorSignature = this.tickerSyncSignatureByUser.get(params.userId);
    const priorAt = this.tickerSyncLastAt.get(params.userId) || 0;
    if (
      priorSignature === signature &&
      now - priorAt < WorldModelService.TICKER_SYNC_THROTTLE_MS
    ) {
      return;
    }

    const dedupeKey = this.inflightKey(["ticker_sync", params.userId, signature]);
    if (this.tickerSyncInflight.has(dedupeKey)) {
      return;
    }

    const request = (async () => {
      try {
        const response = await ApiService.apiFetch(
          `/api/tickers/sync-holdings/${encodeURIComponent(params.userId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...this.getAuthHeaders(params.vaultOwnerToken),
            },
            body: JSON.stringify({
              holdings,
              max_symbols: 250,
              enrich_missing: true,
              refresh_cache: true,
            }),
          }
        );
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.warn(
            `[WorldModelService] ticker sync failed (${response.status}) for ${params.userId}: ${errorText}`
          );
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const changeCount =
          Number(payload.seeded_rows || 0) +
          Number(payload.seed_updates || 0) +
          Number(payload.enrichment_updated || 0);
        if (changeCount > 0) {
          const { preloadTickerUniverse } = await import("@/lib/kai/ticker-universe-cache");
          await preloadTickerUniverse({ forceRefresh: true }).catch(() => undefined);
        }

        this.tickerSyncSignatureByUser.set(params.userId, signature);
        this.tickerSyncLastAt.set(params.userId, Date.now());
      } catch (error) {
        console.warn("[WorldModelService] ticker sync request failed:", error);
      }
    })();

    this.tickerSyncInflight.set(dedupeKey, request);
    try {
      await request;
    } finally {
      if (this.tickerSyncInflight.get(dedupeKey) === request) {
        this.tickerSyncInflight.delete(dedupeKey);
      }
    }
  }

  /**
   * Get auth headers for API requests.
   * 
   * SECURITY: Token must be passed explicitly from useVault() hook.
   * Never reads from sessionStorage (XSS protection).
   */
  private static getAuthHeaders(vaultOwnerToken?: string): HeadersInit {
    return vaultOwnerToken ? { Authorization: `Bearer ${vaultOwnerToken}` } : {};
  }

  private static getVaultOwnerToken(vaultOwnerToken?: string): string | undefined {
    // SECURITY: Only use explicitly passed token, no sessionStorage fallback
    return vaultOwnerToken;
  }

  /**
   * Get user's world model metadata for UI display.
   * This is the primary method for fetching profile data.
   * 
   * Uses in-memory caching with 5-minute TTL to reduce API calls.
   * 
   * @param userId - User's ID
   * @param forceRefresh - If true, bypasses cache and fetches fresh data
   */
  static async getMetadata(
    userId: string,
    forceRefresh = false,
    vaultOwnerToken?: string
  ): Promise<WorldModelMetadata> {
    const cache = CacheService.getInstance();
    const cacheKey = CACHE_KEYS.WORLD_MODEL_METADATA(userId);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = cache.get<WorldModelMetadata>(cacheKey);
      if (cached) {
        console.log("[WorldModelService] Using cached metadata");
        return cached;
      }
    }

    const dedupeKey = this.inflightKey([
      "metadata",
      userId,
      Capacitor.isNativePlatform() ? "native" : "web",
      vaultOwnerToken ? "vault_owner" : "anonymous",
      forceRefresh ? "refresh" : "cached",
    ]);
    const existingRequest = this.metadataInflight.get(dedupeKey);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async (): Promise<WorldModelMetadata> => {
      let result: WorldModelMetadata;
      let cacheTtlMs = CACHE_TTL.MEDIUM;

      if (Capacitor.isNativePlatform()) {
        // Use Capacitor plugin for native platforms
        // Native plugins return snake_case from backend - transform to camelCase
        const nativeResult = await HushhWorldModel.getMetadata({
          userId,
          vaultOwnerToken: this.getVaultOwnerToken(vaultOwnerToken),
        });
         
        const raw = nativeResult as any;
        result = {
          userId: raw.user_id || raw.userId || userId,
          domains: (raw.domains || []).map((d: Record<string, unknown>) => ({
            key: (d.domain_key || d.key) as string,
            displayName: (d.display_name || d.displayName) as string,
            icon: (d.icon_name || d.icon) as string,
            color: (d.color_hex || d.color) as string,
            attributeCount: (d.attribute_count || d.attributeCount || 0) as number,
            summary: (d.summary || {}) as Record<string, string | number>,
            availableScopes: (d.available_scopes || d.availableScopes || []) as string[],
            lastUpdated: (d.last_updated || d.lastUpdated || null) as string | null,
          })),
          totalAttributes: raw.total_attributes || raw.totalAttributes || 0,
          modelCompleteness: raw.model_completeness || raw.modelCompleteness || 0,
          suggestedDomains: raw.suggested_domains || raw.suggestedDomains || [],
          lastUpdated: raw.last_updated || raw.lastUpdated || null,
        };
      } else {
        // Without a VAULT_OWNER token, metadata endpoint is expected to reject with 401.
        // Return empty metadata so first-time / locked-vault screens can render gracefully.
        if (!vaultOwnerToken) {
          result = {
            userId,
            domains: [],
            totalAttributes: 0,
            modelCompleteness: 0,
            suggestedDomains: [],
            lastUpdated: null,
          };
          return result;
        }

        // Web: Use ApiService.apiFetch() for tri-flow compliance
        const response = await ApiService.apiFetch(`/api/world-model/metadata/${userId}`, {
          headers: this.getAuthHeaders(vaultOwnerToken),
        });

        // Handle 404 as valid "no data" response for new users
        if (response.status === 404) {
          result = {
            userId,
            domains: [],
            totalAttributes: 0,
            modelCompleteness: 0,
            suggestedDomains: [],
            lastUpdated: null,
          };
        } else if (response.status === 401 || response.status === 403) {
          // Token may be missing/expired/revoked during startup transitions.
          // Return empty metadata instead of throwing noisy runtime errors.
          console.warn(
            `[WorldModelService] Metadata unauthorized for ${userId}; returning empty state (${response.status})`
          );
          cacheTtlMs = CACHE_TTL.SHORT;
          result = {
            userId,
            domains: [],
            totalAttributes: 0,
            modelCompleteness: 0,
            suggestedDomains: [],
            lastUpdated: null,
          };
        } else if (response.status === 408 || response.status === 429 || response.status >= 500) {
          // Upstream timeout / temporary backend issue.
          // Return an empty shape so callers can apply local fallbacks (cache/blob) without hard crash.
          console.warn(
            `[WorldModelService] Metadata temporarily unavailable for ${userId}; returning empty state (${response.status})`
          );
          cacheTtlMs = CACHE_TTL.SHORT;
          result = {
            userId,
            domains: [],
            totalAttributes: 0,
            modelCompleteness: 0,
            suggestedDomains: [],
            lastUpdated: null,
          };
        } else if (!response.ok) {
          // Any remaining non-OK status should fail open for dashboard bootstrap.
          // Callers already apply local cache/blob fallbacks.
          console.warn(
            `[WorldModelService] Metadata request failed for ${userId}; returning empty state (${response.status})`
          );
          cacheTtlMs = CACHE_TTL.SHORT;
          result = {
            userId,
            domains: [],
            totalAttributes: 0,
            modelCompleteness: 0,
            suggestedDomains: [],
            lastUpdated: null,
          };
        } else {
          const data = await response.json();

          // Transform snake_case to camelCase
          result = {
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
      }

      // Cache the result
      cache.set(cacheKey, result, cacheTtlMs);
      console.log("[WorldModelService] Cached metadata for", userId);

      return result;
    })();

    this.metadataInflight.set(dedupeKey, request);
    try {
      return await request;
    } finally {
      if (this.metadataInflight.get(dedupeKey) === request) {
        this.metadataInflight.delete(dedupeKey);
      }
    }
  }

  /**
   * Store domain data (NEW blob-based architecture).
   *
   * This is the NEW method for storing user data following BYOK principles.
   * Client encrypts entire domain object and backend stores only ciphertext.
   *
   * @param params.userId - User's ID
   * @param params.domain - Domain key (e.g., "financial", "food")
   * @param params.encryptedBlob - Pre-encrypted data from client
   * @param params.summary - Non-sensitive metadata for world_model_index_v2
   */
  static async storeDomainData(params: {
    userId: string;
    domain: string;
    encryptedBlob: EncryptedValue;
    summary: Record<string, unknown>;
    portfolioData?: CachedPortfolioData;
    expectedDataVersion?: number;
    vaultOwnerToken?: string;
  }): Promise<StoreDomainDataResult> {
    if (Capacitor.isNativePlatform()) {
      const result = await HushhWorldModel.storeDomainData({
        userId: params.userId,
        domain: params.domain,
        encryptedBlob: {
          ciphertext: params.encryptedBlob.ciphertext,
          iv: params.encryptedBlob.iv,
          tag: params.encryptedBlob.tag,
          algorithm: params.encryptedBlob.algorithm || "aes-256-gcm",
        },
        summary: params.summary,
        vaultOwnerToken: this.getVaultOwnerToken(params.vaultOwnerToken),
      });

      // Invalidate caches after successful native store
      if (result.success) {
        CacheSyncService.onWorldModelDomainStored(params.userId, params.domain, {
          portfolioData: params.portfolioData,
          encryptedBlob: params.encryptedBlob,
          domainSummary: params.summary,
          metadataTimestamp: new Date().toISOString(),
        });
      }

      return {
        success: result.success,
      };
    }

    const payload: Record<string, unknown> = {
      user_id: params.userId,
      domain: params.domain,
      encrypted_blob: {
        ciphertext: params.encryptedBlob.ciphertext,
        iv: params.encryptedBlob.iv,
        tag: params.encryptedBlob.tag,
        algorithm: params.encryptedBlob.algorithm || "aes-256-gcm",
      },
      summary: params.summary,
    };
    if (Number.isFinite(params.expectedDataVersion)) {
      payload.expected_data_version = Math.max(0, Number(params.expectedDataVersion));
    }

    // Web: Use ApiService.apiFetch() for tri-flow compliance
    const response = await ApiService.apiFetch("/api/world-model/store-domain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(params.vaultOwnerToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 409) {
        let conflictPayload: unknown = null;
        try {
          conflictPayload = await response.json();
        } catch {
          // Ignore JSON parse errors and use a default conflict payload.
        }
        const detail =
          conflictPayload &&
          typeof conflictPayload === "object" &&
          "detail" in conflictPayload
            ? (conflictPayload as { detail?: unknown }).detail
            : conflictPayload;
        const detailRecord =
          detail && typeof detail === "object" ? (detail as Record<string, unknown>) : null;
        return {
          success: false,
          conflict: true,
          message:
            (detailRecord && typeof detailRecord.message === "string"
              ? detailRecord.message
              : null) ?? "World model version conflict.",
          dataVersion:
            detailRecord && typeof detailRecord.current_data_version === "number"
              ? detailRecord.current_data_version
              : undefined,
          updatedAt:
            detailRecord && typeof detailRecord.updated_at === "string"
              ? detailRecord.updated_at
              : undefined,
        };
      }
      const errorText = await response.text();
      throw new Error(`Failed to store domain data: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const resolvedDataVersion =
      typeof data.data_version === "number" ? data.data_version : undefined;
    const resolvedUpdatedAt = typeof data.updated_at === "string" ? data.updated_at : undefined;
    const resolvedMessage = typeof data.message === "string" ? data.message : undefined;
    const enrichedEncryptedBlob: EncryptedUserBlob = {
      ...params.encryptedBlob,
      dataVersion: resolvedDataVersion,
      updatedAt: resolvedUpdatedAt,
    };

    // Invalidate caches after successful store
    CacheSyncService.onWorldModelDomainStored(params.userId, params.domain, {
      portfolioData: params.portfolioData,
      encryptedBlob: enrichedEncryptedBlob,
      domainSummary: params.summary,
      metadataTimestamp: new Date().toISOString(),
    });

    return {
      success: data.success !== false,
      conflict: data.conflict === true,
      message: resolvedMessage,
      dataVersion: resolvedDataVersion,
      updatedAt: resolvedUpdatedAt,
    };
  }

  /**
   * Get available scopes for a user (MCP discovery).
   */
  static async getAvailableScopes(
    userId: string,
    vaultOwnerToken?: string
  ): Promise<ScopeDiscovery> {
    if (Capacitor.isNativePlatform()) {
      const nativeResult = await HushhWorldModel.getAvailableScopes({
        userId,
        vaultOwnerToken: this.getVaultOwnerToken(vaultOwnerToken),
      });
       
      const raw = nativeResult as any;
      return {
        userId: raw.user_id || raw.userId || userId,
        availableDomains: (raw.available_domains || raw.availableDomains || []).map(
          (d: Record<string, unknown>) => ({
            domain: d.domain as string,
            displayName: (d.display_name || d.displayName) as string,
            scopes: (d.scopes || []) as string[],
          })
        ),
        allScopes: raw.all_scopes || raw.allScopes || [],
        wildcardScopes: raw.wildcard_scopes || raw.wildcardScopes || [],
      };
    }

    // Web: Use ApiService.apiFetch() for tri-flow compliance
    const response = await ApiService.apiFetch(`/api/world-model/scopes/${userId}`, {
      headers: this.getAuthHeaders(vaultOwnerToken),
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

  /**
   * Get the full encrypted world-model blob for a user.
   */
  static async getEncryptedData(
    userId: string,
    vaultOwnerToken?: string
  ): Promise<EncryptedUserBlob | null> {
    const cache = CacheService.getInstance();
    const cacheKey = CACHE_KEYS.WORLD_MODEL_BLOB(userId);
    const cached = cache.get<EncryptedUserBlob>(cacheKey);
    if (cached) {
      return cached;
    }

    const dedupeKey = this.inflightKey([
      "encrypted_blob",
      userId,
      Capacitor.isNativePlatform() ? "native" : "web",
      vaultOwnerToken ? "vault_owner" : "anonymous",
    ]);
    const existingRequest = this.encryptedDataInflight.get(dedupeKey);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async (): Promise<EncryptedUserBlob | null> => {
      let result: EncryptedUserBlob | null = null;

      if (Capacitor.isNativePlatform()) {
        const nativeResult = await HushhWorldModel.getEncryptedData({
          userId,
          vaultOwnerToken: this.getVaultOwnerToken(vaultOwnerToken),
        });
        if (nativeResult?.ciphertext && nativeResult?.iv && nativeResult?.tag) {
           
          const raw = nativeResult as any;
          result = {
            ciphertext: raw.ciphertext,
            iv: raw.iv,
            tag: raw.tag,
            algorithm: raw.algorithm || "aes-256-gcm",
            dataVersion:
              typeof raw.data_version === "number"
                ? raw.data_version
                : typeof raw.dataVersion === "number"
                  ? raw.dataVersion
                  : undefined,
            updatedAt:
              typeof raw.updated_at === "string"
                ? raw.updated_at
                : typeof raw.updatedAt === "string"
                  ? raw.updatedAt
                  : undefined,
          };
        }
      } else {
        const response = await ApiService.apiFetch(`/api/world-model/data/${userId}`, {
          headers: this.getAuthHeaders(vaultOwnerToken),
        });

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Failed to get encrypted data: ${response.status}`);
        }

        const data = await response.json();
        if (data?.ciphertext && data?.iv && data?.tag) {
          result = {
            ciphertext: data.ciphertext,
            iv: data.iv,
            tag: data.tag,
            algorithm: data.algorithm || "aes-256-gcm",
            dataVersion: typeof data.data_version === "number" ? data.data_version : undefined,
            updatedAt: typeof data.updated_at === "string" ? data.updated_at : undefined,
          };
        }
      }

      if (result) {
        cache.set(cacheKey, result, CACHE_TTL.SESSION);
      } else {
        cache.invalidate(cacheKey);
      }
      return result;
    })();

    this.encryptedDataInflight.set(dedupeKey, request);
    try {
      return await request;
    } finally {
      if (this.encryptedDataInflight.get(dedupeKey) === request) {
        this.encryptedDataInflight.delete(dedupeKey);
      }
    }
  }

  /**
   * Decrypt and return the full world-model blob.
   * Returns empty object when user has no encrypted data.
   */
  static async loadFullBlob(params: {
    userId: string;
    vaultKey: string;
    vaultOwnerToken?: string;
  }): Promise<Record<string, unknown>> {
    const cache = CacheService.getInstance();
    const encrypted = await this.getEncryptedData(params.userId, params.vaultOwnerToken);
    if (!encrypted) {
      cache.invalidate(CACHE_KEYS.WORLD_MODEL_DECRYPTED_BLOB(params.userId));
      return {};
    }

    const marker = this.buildEncryptedBlobMarker(encrypted);
    const decryptedCacheKey = CACHE_KEYS.WORLD_MODEL_DECRYPTED_BLOB(params.userId);
    const cachedDecrypted = cache.get<DecryptedFullBlobCacheEntry>(decryptedCacheKey);
    if (cachedDecrypted?.marker === marker && cachedDecrypted.blob) {
      return this.cloneRecord(cachedDecrypted.blob);
    }

    const { decryptData } = await import("@/lib/vault/encrypt");
    const decrypted = await decryptData(
      {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        encoding: "base64",
        algorithm: (encrypted.algorithm || "aes-256-gcm") as "aes-256-gcm",
      },
      params.vaultKey
    );

    const parsed = JSON.parse(decrypted);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const parsedBlob = parsed as Record<string, unknown>;
    this.cacheDecryptedBlob({
      userId: params.userId,
      encryptedBlob: encrypted,
      fullBlob: parsedBlob,
    });
    void this.maybeSyncTickersFromFinancialBlob({
      userId: params.userId,
      fullBlob: parsedBlob,
      vaultOwnerToken: params.vaultOwnerToken,
    });
    return this.cloneRecord(parsedBlob);
  }

  /**
   * Merge one domain into full world-model blob, encrypt, and persist.
   */
  static async mergeAndEncryptFullBlob(params: {
    userId: string;
    vaultKey: string;
    domain: string;
    domainData: Record<string, unknown>;
    vaultOwnerToken?: string;
  }): Promise<{
    encryptedBlob: EncryptedValue;
    fullBlob: Record<string, unknown>;
  }> {
    const baseFullBlob = await this.loadFullBlob({
      userId: params.userId,
      vaultKey: params.vaultKey,
      vaultOwnerToken: params.vaultOwnerToken,
    }).catch(() => ({} as Record<string, unknown>));

    return this.mergeAndEncryptPreparedBlob({
      baseFullBlob,
      vaultKey: params.vaultKey,
      domain: params.domain,
      domainData: params.domainData,
    });
  }

  private static async mergeAndEncryptPreparedBlob(params: {
    baseFullBlob: Record<string, unknown>;
    vaultKey: string;
    domain: string;
    domainData: Record<string, unknown>;
  }): Promise<{
    encryptedBlob: EncryptedValue;
    fullBlob: Record<string, unknown>;
  }> {
    const { HushhVault } = await import("@/lib/capacitor");
    const fullBlob = {
      ...params.baseFullBlob,
      [params.domain]: params.domainData,
    };

    const encrypted = await HushhVault.encryptData({
      plaintext: JSON.stringify(fullBlob),
      keyHex: params.vaultKey,
    });

    return {
      encryptedBlob: {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        algorithm: "aes-256-gcm",
      },
      fullBlob,
    };
  }

  /**
   * Merge one domain into full blob and persist via storeDomainData.
   */
  static async storeMergedDomain(params: {
    userId: string;
    vaultKey: string;
    domain: string;
    domainData: Record<string, unknown>;
    summary: Record<string, unknown>;
    expectedDataVersion?: number;
    vaultOwnerToken?: string;
  }): Promise<{
    success: boolean;
    conflict?: boolean;
    message?: string;
    dataVersion?: number;
    updatedAt?: string;
    fullBlob: Record<string, unknown>;
  }> {
    const baseFullBlob = await this.loadFullBlob({
      userId: params.userId,
      vaultKey: params.vaultKey,
      vaultOwnerToken: params.vaultOwnerToken,
    }).catch(() => ({} as Record<string, unknown>));

    return this.storeMergedDomainWithPreparedBlob({
      ...params,
      baseFullBlob,
    });
  }

  /**
   * Merge one domain into a caller-provided decrypted blob and persist.
   * Use this to avoid an extra load/decrypt cycle when the caller already has the full blob.
   */
  static async storeMergedDomainWithPreparedBlob(params: {
    userId: string;
    vaultKey: string;
    domain: string;
    domainData: Record<string, unknown>;
    summary: Record<string, unknown>;
    baseFullBlob: Record<string, unknown>;
    expectedDataVersion?: number;
    vaultOwnerToken?: string;
  }): Promise<{
    success: boolean;
    conflict?: boolean;
    message?: string;
    dataVersion?: number;
    updatedAt?: string;
    fullBlob: Record<string, unknown>;
  }> {
    const merged = await this.mergeAndEncryptPreparedBlob({
      baseFullBlob: params.baseFullBlob,
      vaultKey: params.vaultKey,
      domain: params.domain,
      domainData: params.domainData,
    });

    const summaryWithIntent = {
      domain_intent: params.domain,
      ...params.summary,
    };
    const portfolioData = this.resolvePortfolioDataForDomain({
      domain: params.domain,
      domainData: params.domainData,
    });

    const result = await this.storeDomainData({
      userId: params.userId,
      domain: params.domain,
      encryptedBlob: merged.encryptedBlob,
      summary: summaryWithIntent,
      portfolioData,
      expectedDataVersion: params.expectedDataVersion,
      vaultOwnerToken: params.vaultOwnerToken,
    });

    if (result.success && params.domain === "financial") {
      void this.maybeSyncTickersFromFinancialBlob({
        userId: params.userId,
        fullBlob: merged.fullBlob,
        vaultOwnerToken: params.vaultOwnerToken,
      });
    }
    if (result.success) {
      const encryptedBlobForCache: EncryptedUserBlob = {
        ...merged.encryptedBlob,
        dataVersion: result.dataVersion,
        updatedAt: result.updatedAt,
      };
      this.cacheDecryptedBlob({
        userId: params.userId,
        encryptedBlob: encryptedBlobForCache,
        fullBlob: merged.fullBlob,
      });
    }

    return {
      success: result.success,
      conflict: result.conflict,
      message: result.message,
      dataVersion: result.dataVersion,
      updatedAt: result.updatedAt,
      fullBlob: merged.fullBlob,
    };
  }

  /**
   * Get encrypted domain data blob for decryption on client.
   * This retrieves the encrypted blob stored via storeDomainData().
   * 
   * @param userId - User's ID
   * @param domain - Domain key (e.g., "financial")
   * @returns Encrypted blob with ciphertext, iv, tag, algorithm or null if not found
   */
  static async getDomainData(
    userId: string,
    domain: string,
    vaultOwnerToken?: string
  ): Promise<EncryptedValue | null> {
    const cache = CacheService.getInstance();
    const cacheKey = CACHE_KEYS.ENCRYPTED_DOMAIN_BLOB(userId, domain);
    const cached = cache.get<EncryptedValue>(cacheKey);
    if (cached) {
      return cached;
    }

    const dedupeKey = this.inflightKey([
      "domain_blob",
      userId,
      domain,
      Capacitor.isNativePlatform() ? "native" : "web",
      vaultOwnerToken ? "vault_owner" : "anonymous",
    ]);
    const existingRequest = this.domainDataInflight.get(dedupeKey);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async (): Promise<EncryptedValue | null> => {
      let encryptedBlob: EncryptedValue | null = null;

      if (Capacitor.isNativePlatform()) {
        const result = await HushhWorldModel.getDomainData({
          userId,
          domain,
          vaultOwnerToken: this.getVaultOwnerToken(vaultOwnerToken),
        });
        if (result.encrypted_blob) {
          encryptedBlob = {
            ciphertext: result.encrypted_blob.ciphertext,
            iv: result.encrypted_blob.iv,
            tag: result.encrypted_blob.tag,
            algorithm: result.encrypted_blob.algorithm || "aes-256-gcm",
          };
        }
      } else {
        // Web: Use ApiService.apiFetch() for tri-flow compliance
        const response = await ApiService.apiFetch(
          `/api/world-model/domain-data/${userId}/${domain}`,
          {
            headers: this.getAuthHeaders(vaultOwnerToken),
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Failed to get domain data: ${response.status}`);
        }

        const data = await response.json();
        if (data.encrypted_blob) {
          encryptedBlob = {
            ciphertext: data.encrypted_blob.ciphertext,
            iv: data.encrypted_blob.iv,
            tag: data.encrypted_blob.tag,
            algorithm: data.encrypted_blob.algorithm || "aes-256-gcm",
          };
        }
      }

      if (encryptedBlob) {
        cache.set(cacheKey, encryptedBlob, CACHE_TTL.SESSION);
      } else {
        cache.invalidate(cacheKey);
      }

      return encryptedBlob;
    })();

    this.domainDataInflight.set(dedupeKey, request);
    try {
      return await request;
    } finally {
      if (this.domainDataInflight.get(dedupeKey) === request) {
        this.domainDataInflight.delete(dedupeKey);
      }
    }
  }

  /**
   * Clear all data for a specific domain.
   * This removes the encrypted blob and updates the world model index.
   * 
   * @param userId - User's ID
   * @param domain - Domain key (e.g., "financial")
   * @returns Success status
   */
  static async clearDomain(
    userId: string,
    domain: string,
    vaultOwnerToken?: string
  ): Promise<boolean> {
    const invalidateDomainCaches = () => {
      CacheSyncService.onWorldModelDomainCleared(userId, domain);
    };

    if (Capacitor.isNativePlatform()) {
      const result = await HushhWorldModel.clearDomain({
        userId,
        domain,
        vaultOwnerToken: this.getVaultOwnerToken(vaultOwnerToken),
      });
      if (result.success) {
        invalidateDomainCaches();
      }
      return result.success;
    }

    // Web: Use ApiService.apiFetch() for tri-flow compliance
    const response = await ApiService.apiFetch(
      `/api/world-model/domain-data/${userId}/${domain}`,
      {
        method: "DELETE",
        headers: this.getAuthHeaders(vaultOwnerToken),
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to clear domain: ${response.status}`);
    }

    invalidateDomainCaches();
    return true;
  }
}

// Export default instance for convenience
export default WorldModelService;
