import { resolveAppEnvironment } from "@/lib/app-env";

export type ObservabilityEnvironment = "uat" | "production";

function normalizeValue(raw: string | undefined | null): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

export function resolveObservabilityEnvironment(): ObservabilityEnvironment {
  return resolveAppEnvironment() === "production" ? "production" : "uat";
}

export function isObservabilityEnabled(): boolean {
  const raw = normalizeValue(process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED);
  if (!raw) {
    return true;
  }
  return !["0", "false", "no", "off"].includes(raw);
}

export function isObservabilityDebugEnabled(): boolean {
  const raw = normalizeValue(process.env.NEXT_PUBLIC_OBSERVABILITY_DEBUG);
  return ["1", "true", "yes", "on"].includes(raw);
}

export function resolveObservabilitySampleRate(): number {
  const raw = String(process.env.NEXT_PUBLIC_OBSERVABILITY_SAMPLE_RATE || "").trim();
  if (!raw) {
    return 1;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export function resolveGtmContainerId(): string {
  const explicit = String(process.env.NEXT_PUBLIC_GTM_ID || "").trim();
  if (explicit) {
    return explicit;
  }

  const env = resolveObservabilityEnvironment();
  const uat =
    String(process.env.NEXT_PUBLIC_GTM_ID_UAT || "").trim() ||
    String(process.env.NEXT_PUBLIC_GTM_ID_STAGING || "").trim();
  const production = String(process.env.NEXT_PUBLIC_GTM_ID_PRODUCTION || "").trim();
  return env === "production" ? production : uat;
}
