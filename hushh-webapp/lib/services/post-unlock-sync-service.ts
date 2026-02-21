"use client";

import { UnlockWarmOrchestrator } from "@/lib/services/unlock-warm-orchestrator";

export class PostUnlockSyncService {
  static async run(params: {
    userId: string;
    vaultKey: string;
    vaultOwnerToken: string;
  }): Promise<{
    onboardingSynced: boolean;
    metadataWarmed: boolean;
    financialWarmed: boolean;
  }> {
    const warmed = await UnlockWarmOrchestrator.run(params);
    return {
      onboardingSynced: warmed.onboardingSynced,
      metadataWarmed: warmed.metadataWarmed,
      financialWarmed: warmed.financialWarmed,
    };
  }
}
