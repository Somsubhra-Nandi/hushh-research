"use client";

import {
  KaiProfileService,
  computeRiskScore,
  mapRiskProfile,
} from "@/lib/services/kai-profile-service";
import { KaiNavTourSyncService } from "@/lib/services/kai-nav-tour-sync-service";
import { PreVaultOnboardingService } from "@/lib/services/pre-vault-onboarding-service";

export class KaiProfileSyncService {
  static async syncPendingToVault(params: {
    userId: string;
    vaultKey: string;
    vaultOwnerToken?: string;
  }): Promise<{ synced: boolean; reason?: string }> {
    const pending = await PreVaultOnboardingService.load(params.userId);

    let onboardingSynced = false;
    let onboardingReason: string | undefined;

    if (!pending) {
      onboardingReason = "no_pending_state";
    } else if (!pending.completed) {
      onboardingReason = "not_completed";
    } else if (pending.synced_to_vault_at) {
      onboardingReason = "already_synced";
    } else if (pending.skipped) {
      await KaiProfileService.setOnboardingCompleted({
        userId: params.userId,
        vaultKey: params.vaultKey,
        vaultOwnerToken: params.vaultOwnerToken,
        skippedPreferences: true,
      });
      await PreVaultOnboardingService.markSynced(params.userId);
      onboardingSynced = true;
    } else {
      const answers = pending.answers;
      const riskScore = computeRiskScore(answers);
      if (
        !answers.investment_horizon ||
        !answers.drawdown_response ||
        !answers.volatility_preference ||
        riskScore === null
      ) {
        onboardingReason = "incomplete_answers";
      } else {
        const riskProfile = pending.risk_profile ?? mapRiskProfile(riskScore);

        await KaiProfileService.savePreferences({
          userId: params.userId,
          vaultKey: params.vaultKey,
          vaultOwnerToken: params.vaultOwnerToken,
          mode: "onboarding",
          updates: {
            investment_horizon: answers.investment_horizon,
            drawdown_response: answers.drawdown_response,
            volatility_preference: answers.volatility_preference,
          },
        });

        await KaiProfileService.setOnboardingCompleted({
          userId: params.userId,
          vaultKey: params.vaultKey,
          vaultOwnerToken: params.vaultOwnerToken,
          skippedPreferences: false,
        });

        await PreVaultOnboardingService.markCompleted(params.userId, {
          skipped: false,
          answers,
          risk_score: riskScore,
          risk_profile: riskProfile,
        });
        await PreVaultOnboardingService.markSynced(params.userId);
        onboardingSynced = true;
      }
    }

    const navResult = await KaiNavTourSyncService.syncPendingToVault({
      userId: params.userId,
      vaultKey: params.vaultKey,
      vaultOwnerToken: params.vaultOwnerToken,
    });

    if (onboardingSynced || navResult.synced) {
      return { synced: true };
    }

    return {
      synced: false,
      reason: navResult.reason && navResult.reason !== "no_pending_state"
        ? `nav_tour_${navResult.reason}`
        : onboardingReason ?? "no_pending_state",
    };
  }
}
