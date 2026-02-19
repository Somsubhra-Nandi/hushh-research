"use client";

import { WorldModelService } from "@/lib/services/world-model-service";

const DOMAIN = "kai_profile";
const SCHEMA_VERSION = 2 as const;

export type InvestmentHorizon = "short_term" | "medium_term" | "long_term";
export type DrawdownResponse = "reduce" | "stay" | "buy_more";
export type VolatilityPreference = "small" | "moderate" | "large";
export type RiskProfile = "conservative" | "balanced" | "aggressive";

export type HorizonAnchorChoice = "from_now" | "keep_original";

export type KaiPreferences = {
  investment_horizon: InvestmentHorizon | null;
  investment_horizon_selected_at: string | null;
  investment_horizon_anchor_at: string | null;

  drawdown_response: DrawdownResponse | null;
  drawdown_response_selected_at: string | null;

  volatility_preference: VolatilityPreference | null;
  volatility_preference_selected_at: string | null;

  risk_score: number | null; // 0..6
  risk_profile: RiskProfile | null;
  risk_profile_selected_at: string | null;
};

export type KaiOnboardingState = {
  completed: boolean;
  completed_at: string | null;
  skipped_preferences: boolean;
  nav_tour_completed_at: string | null;
  nav_tour_skipped_at: string | null;
  version: 2;
};

export type KaiProfileV2 = {
  schema_version: 2;
  onboarding: KaiOnboardingState;
  preferences: KaiPreferences;
  updated_at: string;
};

export type KaiPreferencesUpdate = Partial<
  Pick<
    KaiPreferences,
    "investment_horizon" | "drawdown_response" | "volatility_preference"
  >
>;

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function normalizeOptionalIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeInvestmentHorizon(value: unknown): InvestmentHorizon | null {
  return value === "short_term" || value === "medium_term" || value === "long_term"
    ? value
    : null;
}

function normalizeDrawdownResponse(value: unknown): DrawdownResponse | null {
  return value === "reduce" || value === "stay" || value === "buy_more"
    ? value
    : null;
}

function normalizeVolatilityPreference(value: unknown): VolatilityPreference | null {
  return value === "small" || value === "moderate" || value === "large"
    ? value
    : null;
}

function normalizeRiskProfile(value: unknown): RiskProfile | null {
  return value === "conservative" || value === "balanced" || value === "aggressive"
    ? value
    : null;
}

export function scoreInvestmentHorizon(value: InvestmentHorizon | null): number | null {
  if (!value) return null;
  if (value === "short_term") return 0;
  if (value === "medium_term") return 1;
  return 2;
}

export function scoreDrawdownResponse(value: DrawdownResponse | null): number | null {
  if (!value) return null;
  if (value === "reduce") return 0;
  if (value === "stay") return 1;
  return 2;
}

export function scoreVolatilityPreference(value: VolatilityPreference | null): number | null {
  if (!value) return null;
  if (value === "small") return 0;
  if (value === "moderate") return 1;
  return 2;
}

export function computeRiskScore(preferences: {
  investment_horizon: InvestmentHorizon | null;
  drawdown_response: DrawdownResponse | null;
  volatility_preference: VolatilityPreference | null;
}): number | null {
  const a = scoreInvestmentHorizon(preferences.investment_horizon);
  const b = scoreDrawdownResponse(preferences.drawdown_response);
  const c = scoreVolatilityPreference(preferences.volatility_preference);
  if (a === null || b === null || c === null) return null;
  return a + b + c;
}

export function mapRiskProfile(score: number): RiskProfile {
  if (score <= 2) return "conservative";
  if (score <= 4) return "balanced";
  return "aggressive";
}

export function shouldPromptForHorizonAnchor(params: {
  mode: "onboarding" | "edit";
  previousHorizon: InvestmentHorizon | null;
  nextHorizon: InvestmentHorizon | null;
}): boolean {
  if (params.mode !== "edit") return false;
  if (!params.previousHorizon) return false;
  return params.previousHorizon !== params.nextHorizon;
}

export function resolveHorizonAnchorAt(params: {
  previousAnchorAt: string | null;
  now: string;
  choice: HorizonAnchorChoice;
}): string {
  if (params.choice === "keep_original") {
    return params.previousAnchorAt ?? params.now;
  }
  return params.now;
}

function createDefaultProfile(now?: Date): KaiProfileV2 {
  const iso = nowIso(now);
  return {
    schema_version: SCHEMA_VERSION,
    onboarding: {
      completed: false,
      completed_at: null,
      skipped_preferences: false,
      nav_tour_completed_at: null,
      nav_tour_skipped_at: null,
      version: 2,
    },
    preferences: {
      investment_horizon: null,
      investment_horizon_selected_at: null,
      investment_horizon_anchor_at: null,
      drawdown_response: null,
      drawdown_response_selected_at: null,
      volatility_preference: null,
      volatility_preference_selected_at: null,
      risk_score: null,
      risk_profile: null,
      risk_profile_selected_at: null,
    },
    updated_at: iso,
  };
}

function normalizeProfileV2(raw: Record<string, unknown>): KaiProfileV2 {
  const fallback = createDefaultProfile();
  const onboardingRaw =
    raw.onboarding && typeof raw.onboarding === "object" && !Array.isArray(raw.onboarding)
      ? (raw.onboarding as Record<string, unknown>)
      : {};

  const prefsRaw =
    raw.preferences && typeof raw.preferences === "object" && !Array.isArray(raw.preferences)
      ? (raw.preferences as Record<string, unknown>)
      : {};

  const completed = onboardingRaw.completed === true;
  const skipped = onboardingRaw.skipped_preferences === true;

  const investment_horizon = normalizeInvestmentHorizon(prefsRaw.investment_horizon);
  const drawdown_response = normalizeDrawdownResponse(prefsRaw.drawdown_response);
  const volatility_preference = normalizeVolatilityPreference(prefsRaw.volatility_preference);

  const risk_score_raw =
    typeof prefsRaw.risk_score === "number" && Number.isFinite(prefsRaw.risk_score)
      ? prefsRaw.risk_score
      : null;
  const risk_score =
    risk_score_raw !== null && risk_score_raw >= 0 && risk_score_raw <= 6
      ? risk_score_raw
      : null;

  const risk_profile = normalizeRiskProfile(prefsRaw.risk_profile);

  return {
    schema_version: SCHEMA_VERSION,
    onboarding: {
      completed,
      completed_at: normalizeOptionalIso(onboardingRaw.completed_at),
      skipped_preferences: skipped,
      nav_tour_completed_at: normalizeOptionalIso(onboardingRaw.nav_tour_completed_at),
      nav_tour_skipped_at: normalizeOptionalIso(onboardingRaw.nav_tour_skipped_at),
      version: 2,
    },
    preferences: {
      investment_horizon,
      investment_horizon_selected_at: normalizeOptionalIso(
        prefsRaw.investment_horizon_selected_at
      ),
      investment_horizon_anchor_at: normalizeOptionalIso(
        prefsRaw.investment_horizon_anchor_at
      ),
      drawdown_response,
      drawdown_response_selected_at: normalizeOptionalIso(
        prefsRaw.drawdown_response_selected_at
      ),
      volatility_preference,
      volatility_preference_selected_at: normalizeOptionalIso(
        prefsRaw.volatility_preference_selected_at
      ),
      risk_score,
      risk_profile,
      risk_profile_selected_at: normalizeOptionalIso(
        prefsRaw.risk_profile_selected_at
      ),
    },
    updated_at: normalizeOptionalIso(raw.updated_at) ?? fallback.updated_at,
  };
}

function normalizeProfileLegacy(raw: Record<string, unknown>): KaiProfileV2 {
  const fallback = createDefaultProfile();
  const introSeen = raw.intro_seen === true;
  const investment_horizon = normalizeInvestmentHorizon(raw.investment_horizon);

  return {
    schema_version: SCHEMA_VERSION,
    onboarding: {
      completed: introSeen,
      completed_at: null,
      // Legacy users did not answer the world-model questionnaire.
      skipped_preferences: introSeen,
      nav_tour_completed_at: null,
      nav_tour_skipped_at: null,
      version: 2,
    },
    preferences: {
      investment_horizon,
      investment_horizon_selected_at: null,
      investment_horizon_anchor_at: null,
      drawdown_response: null,
      drawdown_response_selected_at: null,
      volatility_preference: null,
      volatility_preference_selected_at: null,
      risk_score: null,
      risk_profile: null,
      risk_profile_selected_at: null,
    },
    updated_at: normalizeOptionalIso(raw.updated_at) ?? fallback.updated_at,
  };
}

function normalizeProfile(raw: unknown): KaiProfileV2 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createDefaultProfile();
  }

  const record = raw as Record<string, unknown>;

  // Legacy v1
  if (record.schema_version === 1 || "intro_seen" in record) {
    return normalizeProfileLegacy(record);
  }

  // v2+
  return normalizeProfileV2(record);
}

async function getFullBlob(params: {
  userId: string;
  vaultKey: string;
  vaultOwnerToken?: string;
}): Promise<Record<string, unknown>> {
  return WorldModelService.loadFullBlob({
    userId: params.userId,
    vaultKey: params.vaultKey,
    vaultOwnerToken: params.vaultOwnerToken,
  });
}

function selectProfile(fullBlob: Record<string, unknown>): KaiProfileV2 {
  const nested = fullBlob[DOMAIN];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return normalizeProfile(nested);
  }
  return normalizeProfile(fullBlob);
}

function recomputeDerived(
  preferences: KaiPreferences,
  now: string
): KaiPreferences {
  const score = computeRiskScore(preferences);
  if (score === null) {
    return {
      ...preferences,
      risk_score: null,
      risk_profile: null,
      risk_profile_selected_at: null,
    };
  }

  const nextProfile = mapRiskProfile(score);
  const changed = preferences.risk_profile !== nextProfile;

  return {
    ...preferences,
    risk_score: score,
    risk_profile: nextProfile,
    risk_profile_selected_at: changed
      ? now
      : preferences.risk_profile_selected_at ?? now,
  };
}

export class KaiProfileService {
  static async getProfile(params: {
    userId: string;
    vaultKey: string;
    vaultOwnerToken?: string;
  }): Promise<KaiProfileV2> {
    try {
      const fullBlob = await getFullBlob(params);
      return selectProfile(fullBlob);
    } catch (error) {
      console.warn("[KaiProfileService] Failed to load kai_profile:", error);
      return createDefaultProfile();
    }
  }

  static async savePreferences(params: {
    userId: string;
    vaultKey: string;
    vaultOwnerToken?: string;
    updates: KaiPreferencesUpdate;
    mode: "onboarding" | "edit";
    horizonAnchorChoice?: HorizonAnchorChoice;
    now?: Date;
  }): Promise<KaiProfileV2> {
    const iso = nowIso(params.now);
    const fullBlob: Record<string, unknown> = await getFullBlob(params).catch(() => ({}));
    const current = selectProfile(fullBlob);

    const next: KaiProfileV2 = {
      ...current,
      schema_version: SCHEMA_VERSION,
      onboarding: {
        ...current.onboarding,
        version: 2,
        // Saving preferences implies "not skipped".
        skipped_preferences: false,
      },
      preferences: { ...current.preferences },
      updated_at: iso,
    };

    // Investment horizon (with anchor semantics)
    if (params.updates.investment_horizon !== undefined) {
      const nextHorizon = params.updates.investment_horizon;
      const prevHorizon = next.preferences.investment_horizon;
      if (nextHorizon !== prevHorizon) {
        next.preferences.investment_horizon = nextHorizon;
        next.preferences.investment_horizon_selected_at = iso;

        if (!prevHorizon) {
          // First time selection: anchor = now.
          next.preferences.investment_horizon_anchor_at = iso;
        } else if (
          shouldPromptForHorizonAnchor({
            mode: params.mode,
            previousHorizon: prevHorizon,
            nextHorizon,
          })
        ) {
          const choice: HorizonAnchorChoice = params.horizonAnchorChoice ?? "from_now";
          next.preferences.investment_horizon_anchor_at = resolveHorizonAnchorAt({
            previousAnchorAt: next.preferences.investment_horizon_anchor_at,
            now: iso,
            choice,
          });
        } else {
          // onboarding mode, or null->value edits
          next.preferences.investment_horizon_anchor_at = iso;
        }
      }
    }

    if (params.updates.drawdown_response !== undefined) {
      const nextDrawdown = params.updates.drawdown_response;
      if (nextDrawdown !== next.preferences.drawdown_response) {
        next.preferences.drawdown_response = nextDrawdown ?? null;
        next.preferences.drawdown_response_selected_at = iso;
      }
    }

    if (params.updates.volatility_preference !== undefined) {
      const nextVol = params.updates.volatility_preference;
      if (nextVol !== next.preferences.volatility_preference) {
        next.preferences.volatility_preference = nextVol ?? null;
        next.preferences.volatility_preference_selected_at = iso;
      }
    }

    next.preferences = recomputeDerived(next.preferences, iso);

    const result = await WorldModelService.storeMergedDomain({
      userId: params.userId,
      vaultKey: params.vaultKey,
      domain: DOMAIN,
      domainData: next as unknown as Record<string, unknown>,
      summary: {
        domain_intent: "kai_profile",
        onboarding_completed: next.onboarding.completed,
        risk_profile: next.preferences.risk_profile,
        risk_score: next.preferences.risk_score,
        has_investment_horizon: Boolean(next.preferences.investment_horizon),
        has_drawdown_response: Boolean(next.preferences.drawdown_response),
        has_volatility_preference: Boolean(next.preferences.volatility_preference),
        last_updated: next.updated_at,
      },
      vaultOwnerToken: params.vaultOwnerToken,
    });

    if (!result.success) {
      throw new Error("Failed to persist kai_profile preferences");
    }

    return next;
  }

  static async setOnboardingCompleted(params: {
    userId: string;
    vaultKey: string;
    vaultOwnerToken?: string;
    skippedPreferences: boolean;
    now?: Date;
  }): Promise<KaiProfileV2> {
    const iso = nowIso(params.now);
    const fullBlob: Record<string, unknown> = await getFullBlob(params).catch(() => ({}));
    const current = selectProfile(fullBlob);

    const next: KaiProfileV2 = {
      ...current,
      schema_version: SCHEMA_VERSION,
      onboarding: {
        ...current.onboarding,
        completed: true,
        completed_at: iso,
        skipped_preferences: params.skippedPreferences,
        version: 2,
      },
      updated_at: iso,
    };

    const result = await WorldModelService.storeMergedDomain({
      userId: params.userId,
      vaultKey: params.vaultKey,
      domain: DOMAIN,
      domainData: next as unknown as Record<string, unknown>,
      summary: {
        domain_intent: "kai_profile",
        onboarding_completed: next.onboarding.completed,
        risk_profile: next.preferences.risk_profile,
        risk_score: next.preferences.risk_score,
        has_investment_horizon: Boolean(next.preferences.investment_horizon),
        has_drawdown_response: Boolean(next.preferences.drawdown_response),
        has_volatility_preference: Boolean(next.preferences.volatility_preference),
        last_updated: next.updated_at,
      },
      vaultOwnerToken: params.vaultOwnerToken,
    });

    if (!result.success) {
      throw new Error("Failed to persist kai_profile onboarding completion");
    }

    return next;
  }

  static async setNavTourState(params: {
    userId: string;
    vaultKey: string;
    vaultOwnerToken?: string;
    completedAt?: string | null;
    skippedAt?: string | null;
    now?: Date;
  }): Promise<KaiProfileV2> {
    const iso = nowIso(params.now);
    const fullBlob: Record<string, unknown> = await getFullBlob(params).catch(() => ({}));
    const current = selectProfile(fullBlob);

    const next: KaiProfileV2 = {
      ...current,
      schema_version: SCHEMA_VERSION,
      onboarding: {
        ...current.onboarding,
        nav_tour_completed_at:
          params.completedAt !== undefined
            ? params.completedAt
            : current.onboarding.nav_tour_completed_at,
        nav_tour_skipped_at:
          params.skippedAt !== undefined
            ? params.skippedAt
            : current.onboarding.nav_tour_skipped_at,
        version: 2,
      },
      updated_at: iso,
    };

    const result = await WorldModelService.storeMergedDomain({
      userId: params.userId,
      vaultKey: params.vaultKey,
      domain: DOMAIN,
      domainData: next as unknown as Record<string, unknown>,
      summary: {
        domain_intent: "kai_profile",
        onboarding_completed: next.onboarding.completed,
        nav_tour_completed: Boolean(next.onboarding.nav_tour_completed_at),
        risk_profile: next.preferences.risk_profile,
        risk_score: next.preferences.risk_score,
        has_investment_horizon: Boolean(next.preferences.investment_horizon),
        has_drawdown_response: Boolean(next.preferences.drawdown_response),
        has_volatility_preference: Boolean(next.preferences.volatility_preference),
        last_updated: next.updated_at,
      },
      vaultOwnerToken: params.vaultOwnerToken,
    });

    if (!result.success) {
      throw new Error("Failed to persist kai_profile nav tour state");
    }

    return next;
  }
}
