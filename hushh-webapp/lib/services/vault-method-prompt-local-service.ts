"use client";

import { Preferences } from "@capacitor/preferences";

const KEY_PREFIX = "vault_method_prompt_v1";

type PromptState = {
  dismissed_for_method: string;
  dismissed_at: string;
};

function keyForUser(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

export class VaultMethodPromptLocalService {
  static async load(userId: string): Promise<PromptState | null> {
    try {
      const { value } = await Preferences.get({ key: keyForUser(userId) });
      if (!value) return null;
      const parsed = JSON.parse(value) as PromptState;
      if (!parsed || typeof parsed !== "object") return null;
      if (
        typeof parsed.dismissed_for_method !== "string" ||
        typeof parsed.dismissed_at !== "string"
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  static async dismiss(userId: string, method: string): Promise<void> {
    const state: PromptState = {
      dismissed_for_method: method,
      dismissed_at: new Date().toISOString(),
    };

    await Preferences.set({
      key: keyForUser(userId),
      value: JSON.stringify(state),
    });
  }

  static async clear(userId: string): Promise<void> {
    await Preferences.remove({ key: keyForUser(userId) });
  }
}
