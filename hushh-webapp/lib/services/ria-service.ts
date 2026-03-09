import { ApiService } from "@/lib/services/api-service";

export type Persona = "investor" | "ria";

export interface PersonaState {
  user_id: string;
  personas: Persona[];
  last_active_persona: Persona;
  investor_marketplace_opt_in: boolean;
  iam_schema_ready: boolean;
  mode: "full" | "compat_investor";
}

export interface MarketplaceRia {
  id: string;
  user_id: string;
  display_name: string;
  headline?: string | null;
  strategy_summary?: string | null;
  verification_status: string;
  firms?: Array<{
    firm_id: string;
    legal_name: string;
    role_title?: string | null;
    is_primary?: boolean;
  }>;
}

export interface MarketplaceInvestor {
  user_id: string;
  display_name: string;
  headline?: string | null;
  location_hint?: string | null;
  strategy_summary?: string | null;
}

export interface RiaOnboardingStatus {
  exists: boolean;
  ria_profile_id?: string;
  verification_status: string;
  display_name?: string;
  legal_name?: string | null;
  finra_crd?: string | null;
  sec_iard?: string | null;
  latest_verification_event?: {
    outcome: string;
    checked_at: string;
    expires_at?: string | null;
    reference_metadata?: Record<string, unknown>;
  } | null;
}

export interface RiaClientAccess {
  id: string;
  investor_user_id: string;
  status: string;
  granted_scope?: string | null;
  last_request_id?: string | null;
  investor_display_name?: string | null;
  investor_headline?: string | null;
}

export interface RiaRequestRecord {
  request_id: string;
  user_id: string;
  scope: string;
  action: string;
  issued_at: number;
  expires_at?: number | null;
  metadata?: Record<string, unknown>;
}

interface FetchOptions {
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  idToken?: string;
}

interface ErrorPayload {
  detail?: string;
  error?: string;
  code?: string;
  hint?: string;
}

export class RiaApiError extends Error {
  status: number;
  code?: string;
  hint?: string;

  constructor(message: string, status: number, code?: string, hint?: string) {
    super(message);
    this.name = "RiaApiError";
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

export function isIAMSchemaNotReadyError(error: unknown): error is RiaApiError {
  return error instanceof RiaApiError && error.code === "IAM_SCHEMA_NOT_READY";
}

async function toJsonOrThrow<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (!response.ok) {
    const message =
      (typeof payload.detail === "string" && payload.detail) ||
      (typeof payload.error === "string" && payload.error) ||
      `Request failed: ${response.status}`;
    const code = typeof payload.code === "string" ? payload.code : undefined;
    const hint = typeof payload.hint === "string" ? payload.hint : undefined;
    throw new RiaApiError(message, response.status, code, hint);
  }
  return payload;
}

async function authFetch(path: string, options: FetchOptions): Promise<Response> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (options.idToken) {
    headers.Authorization = `Bearer ${options.idToken}`;
  }

  return ApiService.apiFetch(path, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

export class RiaService {
  static async getPersonaState(idToken: string): Promise<PersonaState> {
    const response = await authFetch("/api/iam/persona", {
      method: "GET",
      idToken,
    });
    return toJsonOrThrow<PersonaState>(response);
  }

  static async switchPersona(idToken: string, persona: Persona): Promise<PersonaState> {
    const response = await authFetch("/api/iam/persona/switch", {
      method: "POST",
      idToken,
      body: { persona },
    });
    return toJsonOrThrow<PersonaState>(response);
  }

  static async setInvestorMarketplaceOptIn(
    idToken: string,
    enabled: boolean
  ): Promise<{ user_id: string; investor_marketplace_opt_in: boolean }> {
    const response = await authFetch("/api/iam/marketplace/opt-in", {
      method: "POST",
      idToken,
      body: { enabled },
    });
    return toJsonOrThrow<{ user_id: string; investor_marketplace_opt_in: boolean }>(response);
  }

  static async searchRias(params: {
    query?: string;
    limit?: number;
    firm?: string;
    verification_status?: string;
  }): Promise<MarketplaceRia[]> {
    const query = new URLSearchParams();
    if (params.query) query.set("query", params.query);
    if (params.firm) query.set("firm", params.firm);
    if (params.verification_status) {
      query.set("verification_status", params.verification_status);
    }
    if (typeof params.limit === "number") query.set("limit", String(params.limit));

    const response = await ApiService.apiFetch(`/api/marketplace/rias?${query.toString()}`, {
      method: "GET",
    });
    const payload = await toJsonOrThrow<{ items: MarketplaceRia[] }>(response);
    return payload.items;
  }

  static async searchInvestors(params: {
    query?: string;
    limit?: number;
  }): Promise<MarketplaceInvestor[]> {
    const query = new URLSearchParams();
    if (params.query) query.set("query", params.query);
    if (typeof params.limit === "number") query.set("limit", String(params.limit));

    const response = await ApiService.apiFetch(`/api/marketplace/investors?${query.toString()}`, {
      method: "GET",
    });
    const payload = await toJsonOrThrow<{ items: MarketplaceInvestor[] }>(response);
    return payload.items;
  }

  static async getRiaPublicProfile(riaId: string): Promise<MarketplaceRia> {
    const response = await ApiService.apiFetch(`/api/marketplace/ria/${encodeURIComponent(riaId)}`, {
      method: "GET",
    });
    return toJsonOrThrow<MarketplaceRia>(response);
  }

  static async submitOnboarding(
    idToken: string,
    payload: {
      display_name: string;
      legal_name?: string;
      finra_crd?: string;
      sec_iard?: string;
      bio?: string;
      strategy?: string;
      disclosures_url?: string;
      primary_firm_name?: string;
      primary_firm_role?: string;
    }
  ): Promise<{
    ria_profile_id: string;
    verification_status: string;
    verification_outcome: string;
    verification_message: string;
  }> {
    const response = await authFetch("/api/ria/onboarding/submit", {
      method: "POST",
      idToken,
      body: payload,
    });
    return toJsonOrThrow(response);
  }

  static async getOnboardingStatus(idToken: string): Promise<RiaOnboardingStatus> {
    const response = await authFetch("/api/ria/onboarding/status", {
      method: "GET",
      idToken,
    });
    return toJsonOrThrow<RiaOnboardingStatus>(response);
  }

  static async listClients(idToken: string): Promise<RiaClientAccess[]> {
    const response = await authFetch("/api/ria/clients", {
      method: "GET",
      idToken,
    });
    const payload = await toJsonOrThrow<{ items: RiaClientAccess[] }>(response);
    return payload.items;
  }

  static async listRequests(idToken: string): Promise<RiaRequestRecord[]> {
    const response = await authFetch("/api/ria/requests", {
      method: "GET",
      idToken,
    });
    const payload = await toJsonOrThrow<{ items: RiaRequestRecord[] }>(response);
    return payload.items;
  }

  static async createRequest(
    idToken: string,
    payload: {
      subject_user_id: string;
      scope_template_id: string;
      selected_scope?: string;
      duration_mode?: "preset" | "custom";
      duration_hours?: number;
      requester_actor_type?: "ria";
      subject_actor_type?: "investor";
      firm_id?: string;
      reason?: string;
    }
  ): Promise<{
    request_id: string;
    scope: string;
    status: string;
    expires_at: number;
  }> {
    const response = await authFetch("/api/ria/requests", {
      method: "POST",
      idToken,
      body: payload,
    });
    return toJsonOrThrow(response);
  }

  static async getWorkspace(
    idToken: string,
    investorUserId: string
  ): Promise<{
    workspace_ready: boolean;
    available_domains: string[];
    domain_summaries: Record<string, unknown>;
    total_attributes: number;
    relationship_status: string;
    scope: string;
  }> {
    const response = await authFetch(
      `/api/ria/workspace/${encodeURIComponent(investorUserId)}`,
      {
        method: "GET",
        idToken,
      }
    );
    return toJsonOrThrow(response);
  }
}
