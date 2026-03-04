/**
 * Central route contract for the web + Capacitor app.
 * Keep every app-level navigation target here to avoid drift.
 */

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  LOGOUT: "/logout",
  PROFILE: "/profile",
  CONSENTS: "/consents",
  KAI_HOME: "/kai",
  KAI_ONBOARDING: "/kai/onboarding",
  KAI_IMPORT: "/kai/import",
  KAI_DASHBOARD: "/kai/dashboard",
  KAI_ANALYSIS: "/kai/analysis",
  KAI_OPTIMIZE: "/kai/optimize",
} as const;

export function isKaiOnboardingRoute(pathname: string): boolean {
  return (
    pathname === ROUTES.KAI_ONBOARDING ||
    pathname.startsWith(`${ROUTES.KAI_ONBOARDING}/`)
  );
}

export function isPublicRoute(pathname: string): boolean {
  return (
    pathname === ROUTES.HOME ||
    pathname === ROUTES.LOGIN ||
    pathname === ROUTES.LOGOUT ||
    pathname === ROUTES.PROFILE
  );
}
