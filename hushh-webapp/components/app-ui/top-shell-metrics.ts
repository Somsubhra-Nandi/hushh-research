import { ROUTES } from "@/lib/navigation/routes";

export type TopContentOffsetMode = "normal" | "fullscreen-flow";
export type TopShellRouteProfileId =
  | "hidden"
  | "kai-fullscreen-flow"
  | "default-no-tabs";

export interface TopShellMetrics {
  shellVisible: boolean;
  hasTabs: boolean;
  contentOffsetMode: TopContentOffsetMode;
}

interface TopShellRouteProfile {
  id: TopShellRouteProfileId;
  matches: (pathname: string) => boolean;
  metrics: TopShellMetrics;
}

function routeMatches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

const HIDDEN_METRICS: TopShellMetrics = {
  shellVisible: false,
  hasTabs: false,
  contentOffsetMode: "normal",
};

const FULLSCREEN_METRICS: TopShellMetrics = {
  shellVisible: true,
  hasTabs: false,
  contentOffsetMode: "fullscreen-flow",
};

const DEFAULT_VISIBLE_METRICS: TopShellMetrics = {
  shellVisible: true,
  hasTabs: false,
  contentOffsetMode: "normal",
};

const TOP_SHELL_ROUTE_PROFILES: readonly TopShellRouteProfile[] = [
  {
    id: "hidden",
    matches: (pathname) =>
      pathname === ROUTES.HOME ||
      routeMatches(pathname, ROUTES.LOGIN) ||
      routeMatches(pathname, ROUTES.LOGOUT) ||
      routeMatches(pathname, ROUTES.LABS_PROFILE_APPEARANCE),
    metrics: HIDDEN_METRICS,
  },
  {
    id: "kai-fullscreen-flow",
    matches: (pathname) => routeMatches(pathname, ROUTES.KAI_ONBOARDING),
    metrics: FULLSCREEN_METRICS,
  },
] as const;

export function shouldHideTopShell(pathname: string): boolean {
  return resolveTopShellRouteProfile(pathname).id === "hidden";
}

export function isTopShellFullscreenFlowRoute(pathname: string): boolean {
  return resolveTopShellRouteProfile(pathname).id === "kai-fullscreen-flow";
}

export function shouldShowKaiTabsInTopShell(_pathname: string): boolean {
  return false;
}

export function resolveTopShellRouteProfile(pathname: string): TopShellRouteProfile {
  const profile = TOP_SHELL_ROUTE_PROFILES.find((candidate) =>
    candidate.matches(pathname)
  );
  return profile ?? { id: "default-no-tabs", metrics: DEFAULT_VISIBLE_METRICS, matches: () => true };
}

export function resolveTopShellMetrics(pathname: string): TopShellMetrics {
  return resolveTopShellRouteProfile(pathname).metrics;
}

export function resolveTopShellHeight(pathname: string): string {
  return resolveTopShellMetrics(pathname).shellVisible
    ? "var(--top-shell-reserved-height)"
    : "0px";
}
