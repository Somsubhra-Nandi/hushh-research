"use client";

const ACTIVE_PICK_SOURCE_PREFIX = "kai_active_pick_source_";

export function getKaiActivePickSource(userId: string | null | undefined): string {
  if (!userId || typeof window === "undefined") return "default";
  try {
    const value = window.sessionStorage.getItem(`${ACTIVE_PICK_SOURCE_PREFIX}${userId}`);
    return value && value.trim() ? value.trim() : "default";
  } catch {
    return "default";
  }
}

export function setKaiActivePickSource(userId: string | null | undefined, sourceId: string): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${ACTIVE_PICK_SOURCE_PREFIX}${userId}`,
      sourceId && sourceId.trim() ? sourceId.trim() : "default"
    );
  } catch {
    // Ignore browser storage failures.
  }
}
