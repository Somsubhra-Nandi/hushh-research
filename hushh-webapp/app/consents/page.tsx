"use client";

/**
 * Consent Management Dashboard
 *
 * Shows:
 * 1. Pending consent requests from developers
 * 2. Active session tokens
 * 3. Consent audit history (logs)
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/morphy-ux/morphy";
import {
  Check,
  X,
  Shield,
  Clock,
  RefreshCw,
  Bell,
  CheckCircle2,
  History,
  Key,
  Ban,
  Clipboard,
  Lock,
  FileText,
  Activity,
  Utensils,
  Briefcase,
  Wallet,
  Crown,
  LineChart,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/lib/morphy-ux/ui/tabs";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/lib/morphy-ux/ui";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useVault } from "@/lib/vault/vault-context";
import { FCM_MESSAGE_EVENT } from "@/lib/notifications";
import { ApiService } from "@/lib/services/api-service";
import { CacheService, CACHE_KEYS } from "@/lib/services/cache-service";
import { useConsentActions } from "@/lib/consent";
import { DataTable } from "@/components/ui/data-table";
import {
  appColumns,
  AppSummary,
  AuditLogEntry,
} from "./columns";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

import { useAuth } from "@/hooks/use-auth";
import { useStepProgress } from "@/lib/progress/step-progress-context";

interface PendingConsent {
  id: string;
  developer: string;
  scope: string;
  scopeDescription: string;
  requestedAt: number;
  expiryHours: number;
}

interface ConsentAuditEntry {
  id: string;
  token_id: string;
  agent_id: string;
  scope: string;
  action: string;
  issued_at: number;
  expires_at: number | null;
  token_type: string;
  request_id: string | null;
  is_timed_out?: boolean; // Backend detects if REQUESTED + poll_timeout_at passed
}

interface SessionInfo {
  isActive: boolean;
  expiresAt: number | null;
  token: string | null;
  scope: string;
}

interface ActiveConsent {
  id: string;
  scope: string;
  developer: string;
  issued_at: number;
  expires_at: number;
  time_remaining_ms: number;
}

const CONSENTS_CACHE_TTL_MS = 3 * 60 * 1000;

// ============================================================================
// MODULE-LEVEL HELPER FUNCTIONS (used by multiple components)
// ============================================================================

// Icon renderer helper (replaces emojis)
const ICON_MAP: Record<string, LucideIcon> = {
  clipboard: Clipboard,
  check: Check,
  x: X,
  ban: Ban,
  clock: Clock,
  lock: Lock,
  "file-text": FileText,
  activity: Activity,
  utensils: Utensils,
  briefcase: Briefcase,
  wallet: Wallet,
  crown: Crown,
  "line-chart": LineChart,
};

const renderIcon = (
  iconName: string,
  opts?: { size?: "xs" | "sm" | "md" | "lg" | "xl" | number; className?: string }
) => {
  const Lucide = ICON_MAP[iconName] || FileText;
  return <Icon icon={Lucide} size={opts?.size ?? "sm"} className={opts?.className} />;
};

// User-friendly action labels with colors (no emojis)
const getActionInfoLocal = (
  action: string
): { label: string; icon: string; className: string } => {
  const actionMap: Record<
    string,
    { label: string; icon: string; className: string }
  > = {
    REQUESTED: {
      label: "Access Requested",
      icon: "clipboard",
      className: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    },
    CONSENT_GRANTED: {
      label: "Access Granted",
      icon: "check",
      className: "bg-green-500/10 text-green-600 border-green-500/20",
    },
    CONSENT_DENIED: {
      label: "Access Denied",
      icon: "x",
      className: "bg-red-500/10 text-red-600 border-red-500/20",
    },
    CANCELLED: {
      label: "Request Cancelled",
      icon: "ban",
      className: "bg-gray-500/10 text-gray-600 border-gray-500/20",
    },
    TIMED_OUT: {
      label: "Request Expired",
      icon: "clock",
      className: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    },
    REVOKED: {
      label: "Access Revoked",
      icon: "lock",
      className: "bg-red-500/10 text-red-600 border-red-500/20",
    },
    OPERATION_PERFORMED: {
      label: "Operation",
      icon: "activity",
      className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    },
  };
  return (
    actionMap[action] || {
      label: action,
      icon: "file-text",
      className: "bg-gray-500/10 text-gray-600",
    }
  );
};

// Human-readable scope labels - comprehensive mappings for user-friendly display
const formatScopeLocal = (
  scope: string
): { icon: string; label: string; description: string } => {
  const scopeMap: Record<
    string,
    { icon: string; label: string; description: string }
  > = {
    // Vault owner scopes
    "vault.owner": {
      icon: "crown",
      label: "Full Access",
      description: "Complete control over your vault (You)",
    },
    VAULT_OWNER: {
      icon: "crown",
      label: "Full Access",
      description: "Complete control over your vault (You)",
    },
    
    // Financial scopes
    vault_read_finance: {
      icon: "wallet",
      label: "View Finances",
      description: "Read your budget and spending preferences",
    },
    vault_write_finance: {
      icon: "wallet",
      label: "Edit Finances",
      description: "Update your financial data and preferences",
    },
    "vault.read.finance": {
      icon: "wallet",
      label: "View Finances",
      description: "Read investment preferences and financial data",
    },
    "vault.write.finance": {
      icon: "wallet",
      label: "Edit Finances",
      description: "Update investment preferences and financial data",
    },
    "attr.financial.*": {
      icon: "wallet",
      label: "Financial Data",
      description: "All financial attributes and preferences",
    },
    
    // Food & Dining scopes
    vault_read_food: {
      icon: "utensils",
      label: "View Food Prefs",
      description: "Read your dietary preferences and favorites",
    },
    vault_write_food: {
      icon: "utensils",
      label: "Edit Food Prefs",
      description: "Update your dietary preferences and favorites",
    },
    "vault.read.food": {
      icon: "utensils",
      label: "View Food Prefs",
      description: "Read your dietary preferences and favorites",
    },
    "vault.write.food": {
      icon: "utensils",
      label: "Edit Food Prefs",
      description: "Update your dietary preferences and favorites",
    },
    "attr.food.*": {
      icon: "utensils",
      label: "Food Preferences",
      description: "All food and dining attributes",
    },
    
    // Professional scopes
    vault_read_professional: {
      icon: "briefcase",
      label: "View Profile",
      description: "Read your professional skills and experience",
    },
    vault_write_professional: {
      icon: "briefcase",
      label: "Edit Profile",
      description: "Update your professional skills and experience",
    },
    "vault.read.professional": {
      icon: "briefcase",
      label: "View Profile",
      description: "Read your professional skills and experience",
    },
    "vault.write.professional": {
      icon: "briefcase",
      label: "Edit Profile",
      description: "Update your professional skills and experience",
    },
    "attr.professional.*": {
      icon: "briefcase",
      label: "Professional Profile",
      description: "All professional attributes",
    },
    
    // Kai / Investment scopes
    "agent.kai.analyze": {
      icon: "line-chart",
      label: "Investment Analysis",
      description: "Analyze stocks and investment opportunities",
    },
    
    // Generic read/write/all scopes
    vault_read_all: {
      icon: "file-text",
      label: "Read All Data",
      description: "Full read access to all vault data",
    },
    vault_write_all: {
      icon: "file-text",
      label: "Write All Data",
      description: "Full write access to all vault data",
    },
    "vault.read.all": {
      icon: "file-text",
      label: "Read All Data",
      description: "Full read access to all vault data",
    },
    "vault.write.all": {
      icon: "file-text",
      label: "Write All Data",
      description: "Full write access to all vault data",
    },
  };

  // Check for exact match first
  if (scopeMap[scope]) {
    return scopeMap[scope];
  }
  
  // Handle dynamic attr.{domain}.* scopes
  const attrMatch = scope.match(/^attr\.([a-z_]+)\.(\*|[a-z_]+)$/i);
  if (attrMatch && attrMatch[1]) {
    const domain = attrMatch[1];
    const formattedDomain = domain
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      icon: domain.includes("food") ? "utensils" 
          : domain.includes("finance") || domain.includes("kai") ? "wallet"
          : domain.includes("professional") ? "briefcase"
          : "file-text",
      label: formattedDomain,
      description: `Access to ${formattedDomain.toLowerCase()} data`,
    };
  }
  
  // Fallback: format scope into readable label
  const formattedLabel = scope
    .replace(/^vault[_\.]?(read|write)?[_\.]?/i, "")
    .replace(/^attr\./i, "")
    .replace(/[_\.]/g, " ")
    .replace(/\*/g, "All")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Data Access";
    
  return {
    icon: "lock",
    label: formattedLabel,
    description: `Permission: ${formattedLabel}`,
  };
};

const normalizeScopeLocal = (scope: string): string =>
  scope.trim().toLowerCase().replace(/_/g, ".");

const isVaultOwnerScope = (scope: string): boolean =>
  normalizeScopeLocal(scope) === "vault.owner";

// ============================================================================

// AppAuditLog component - groups by app and shows Drawer for event details
function AppAuditLog({
  auditLog,
  activeConsents,
}: {
  auditLog: AuditLogEntry[];
  activeConsents: ActiveConsent[];
}) {
  const [selectedApp, setSelectedApp] = React.useState<AppSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Group audit log by app and compute summary
  const appSummaries: AppSummary[] = React.useMemo(() => {
    const grouped = auditLog.reduce((acc, entry) => {
      const appName = entry.agent_id || "Unknown App";
      if (!acc[appName]) {
        acc[appName] = [];
      }
      acc[appName].push(entry);
      return acc;
    }, {} as Record<string, AuditLogEntry[]>);

    return Object.entries(grouped)
      .map(([agent_id, events]) => {
        const sortedEvents = [...events].sort(
          (a, b) => b.issued_at - a.issued_at
        );
        const hasActiveToken = activeConsents.some(
          (c) => c.developer === agent_id
        );

        return {
          agent_id,
          lastActivity: sortedEvents[0]?.issued_at ?? 0,
          totalEvents: events.length,
          hasActiveToken,
          events: sortedEvents,
        };
      })
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [auditLog, activeConsents]);

  // Handle row click to open drawer
  const handleRowClick = (app: AppSummary) => {
    setSelectedApp(app);
    setDrawerOpen(true);
  };

  // Format date for drawer
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon icon={History} size="md" />
            Connected Apps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={appColumns}
            data={appSummaries}
            searchPlaceholder="Search by app name..."
            onRowClick={handleRowClick}
          />
        </CardContent>
      </Card>

      {/* Event Trail Drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Icon icon={Shield} size="md" />
              {selectedApp?.agent_id}
              {selectedApp?.hasActiveToken && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 ml-2">
                  Active
                </Badge>
              )}
            </DrawerTitle>
            <DrawerDescription>
              {selectedApp?.totalEvents} events • Last activity{" "}
              {selectedApp?.lastActivity
                ? formatDate(selectedApp.lastActivity)
                : "N/A"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 py-2 max-h-[50vh] overflow-y-auto">
            {/* Group by request trail */}
            {selectedApp?.events &&
              (() => {
                const trails = Object.entries(
                  selectedApp.events.reduce((acc, entry) => {
                    const trailKey = entry.request_id || `single-${entry.id}`;
                    if (!acc[trailKey]) acc[trailKey] = [];
                    acc[trailKey].push(entry);
                    return acc;
                  }, {} as Record<string, AuditLogEntry[]>)
                )
                  .map(([trailId, events]) => ({
                    trailId,
                    events: [...events].sort(
                      (a, b) => a.issued_at - b.issued_at
                    ),
                  }))
                  .sort(
                    (a, b) =>
                      (b.events[0]?.issued_at ?? 0) -
                      (a.events[0]?.issued_at ?? 0)
                  );

                return trails.map(({ trailId, events }) => {
                  const firstEvent = events[0];
                  const lastEvent = events[events.length - 1];

                  // Skip if no events (shouldn't happen but satisfies TypeScript)
                  if (!firstEvent || !lastEvent) return null;

                  const scopeInfo = formatScopeLocal(firstEvent.scope);

                  // Status color
                  const statusColor =
                    lastEvent.action === "CONSENT_GRANTED"
                      ? "border-l-green-500"
                      : lastEvent.action === "REVOKED" ||
                        lastEvent.action === "CONSENT_DENIED"
                      ? "border-l-red-500"
                      : lastEvent.is_timed_out
                      ? "border-l-orange-500"
                      : "border-l-orange-500";

                  return (
                    <div
                      key={trailId}
                      className={`border-l-4 ${statusColor} px-4 py-3 mb-3 bg-muted/20`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="flex items-center gap-1">
                          {renderIcon(scopeInfo.icon)} {scopeInfo.label}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {events.map((entry) => {
                          const actionInfo = getActionInfoLocal(
                            entry.is_timed_out ? "TIMED_OUT" : entry.action
                          );
                          return (
                            <div
                              key={entry.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="flex items-center gap-2">
                                {renderIcon(actionInfo.icon)}
                                <span className="font-medium">
                                  {actionInfo.label}
                                </span>
                                {/* Show operation details for vault.owner operations */}
                                {entry.action === "OPERATION_PERFORMED" && (entry.scope_description || entry.metadata?.operation) && (
                                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {entry.scope_description || entry.metadata?.operation}
                                    {entry.metadata?.target && ` → ${entry.metadata.target}`}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(entry.issued_at)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
          </div>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="none" className="cursor-pointer border">
                Close
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

// Need React for useMemo and useState in AppAuditLog
import * as React from "react";

export default function ConsentsPage() {
  const searchParams = useSearchParams();
  const { vaultKey: _vaultKey, isVaultUnlocked: _isVaultUnlocked, vaultOwnerToken } = useVault();
  const [pending, setPending] = useState<PendingConsent[]>([]);
  const [auditLog, setAuditLog] = useState<ConsentAuditEntry[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [activeConsents, setActiveConsents] = useState<ActiveConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const { registerSteps, completeStep, reset } = useStepProgress();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Tab from URL param (e.g., ?tab=session)
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabFromUrl && ["pending", "session", "history"].includes(tabFromUrl)
      ? tabFromUrl
      : "pending"
  );

  const fetchPendingConsents = useCallback(async (uid: string, token: string, forceRefresh = false) => {
    if (!token) return;

    const cache = CacheService.getInstance();
    const cacheKey = CACHE_KEYS.PENDING_CONSENTS(uid);
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = cache.get<PendingConsent[]>(cacheKey);
      if (cached) {
        setPending(cached);
        return;
      }
    }
    
    try {
      const response = await ApiService.getPendingConsents(uid, token);
      if (response.ok) {
        const data = await response.json();
        const pendingData = data.pending || [];
        setPending(pendingData);
        cache.set(cacheKey, pendingData, CONSENTS_CACHE_TTL_MS);
      }
    } catch (err) {
      console.error("Error fetching pending consents:", err);
    }
  }, []);

  const fetchAuditLog = useCallback(async (uid: string, token: string, forceRefresh = false) => {
    if (!token) return;

    const cache = CacheService.getInstance();
    const cacheKey = CACHE_KEYS.CONSENT_AUDIT_LOG(uid);
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = cache.get<ConsentAuditEntry[]>(cacheKey);
      if (cached) {
        setAuditLog(cached);
        return;
      }
    }
    
    try {
      const response = await ApiService.getConsentHistory(uid, token, 1, 50);
      if (response.ok) {
        const data = await response.json();
        let auditData: ConsentAuditEntry[] = [];
        // Handle various potential response structures
        if (Array.isArray(data)) {
          auditData = data;
        } else if (data.items) {
          auditData = data.items;
        } else if (data.history) {
          auditData = data.history;
        }
        setAuditLog(auditData);
        cache.set(cacheKey, auditData, CONSENTS_CACHE_TTL_MS);
      }
    } catch (err) {
      console.error("Error fetching audit log:", err);
    }
  }, []);

  const fetchActiveConsents = useCallback(async (uid: string, token: string, forceRefresh = false) => {
    if (!token) return;
    
    const cache = CacheService.getInstance();
    const cacheKey = CACHE_KEYS.ACTIVE_CONSENTS(uid);
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = cache.get<ActiveConsent[]>(cacheKey);
      if (cached) {
        setActiveConsents(cached);
        return;
      }
    }
    
    try {
      const response = await ApiService.getActiveConsents(uid, token);
      if (response.ok) {
        const data = await response.json();
        const activeData = (data.active || []) as ActiveConsent[];
        const ownerConsents = activeData
          .filter((consent) => isVaultOwnerScope(consent.scope))
          .sort((a, b) => (b.issued_at || 0) - (a.issued_at || 0));
        const latestOwnerConsent = ownerConsents[0] || null;
        const externalConsents = activeData.filter(
          (consent) => !isVaultOwnerScope(consent.scope)
        );
        const dedupedActiveData = latestOwnerConsent
          ? [latestOwnerConsent, ...externalConsents]
          : externalConsents;

        setActiveConsents(dedupedActiveData);
        cache.set(cacheKey, dedupedActiveData, CONSENTS_CACHE_TTL_MS);
      }
    } catch (err) {
      console.error("Error fetching active consents:", err);
    }
  }, []);

  const { user: _user, isAuthenticated: _isAuthenticated, loading: authLoading } = useAuth();

  // Consolidated init effect - cache-first then background refresh
  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      // Wait for auth to finish loading
      if (authLoading) return;

      // Register steps only once
      if (!initialized) {
        registerSteps(3);
        setInitialized(true);
      }

      // Step 1: Auth check
      completeStep();

      // Get user ID from auth context instead of sessionStorage
      const uid = _user?.uid || null;
      // Session token/expires are orphaned reads (no writers exist).
      // Use vaultOwnerToken from vault context as the effective token.
      const token: string | null = vaultOwnerToken || null;

      if (cancelled) return;

      if (uid) {
        setUserId(uid);
        const effectiveToken = token || "";

        // Cache-first: show cached data immediately so UI renders without waiting
        const cache = CacheService.getInstance();
        const cachedPending = cache.get<PendingConsent[]>(CACHE_KEYS.PENDING_CONSENTS(uid));
        const cachedAudit = cache.get<ConsentAuditEntry[]>(CACHE_KEYS.CONSENT_AUDIT_LOG(uid));
        const cachedActive = effectiveToken
          ? cache.get<ActiveConsent[]>(CACHE_KEYS.ACTIVE_CONSENTS(uid))
          : null;
        if (cachedPending) setPending(cachedPending);
        if (cachedAudit) setAuditLog(cachedAudit);
        if (cachedActive) setActiveConsents(cachedActive);
        const hasAnyCache = !!(cachedPending || cachedAudit || cachedActive);
        
        if (hasAnyCache && !cancelled) {
          // Cache hit: complete all remaining steps immediately so progress bar hides
          setLoading(false);
          completeStep(); // Step 2
          completeStep(); // Step 3
        }

        // Session state derived from vault context
        if (effectiveToken) {
          setSession({
            isActive: true,
            expiresAt: null,
            token: effectiveToken,
            scope: "vault.owner",
          });
        }

        // Background refresh (forceRefresh) to get latest data - silent when cache was used
        try {
          if (effectiveToken) {
            await fetchPendingConsents(uid, effectiveToken, true);
            if (!cancelled && !hasAnyCache) completeStep();
            await Promise.all([
              fetchAuditLog(uid, effectiveToken, true),
              fetchActiveConsents(uid, effectiveToken, true),
            ]);
            if (!cancelled && !hasAnyCache) completeStep();
          } else if (!cancelled && !hasAnyCache) {
            completeStep();
            completeStep();
          }
        } catch (error) {
          console.error("Error loading consents:", error);
          if (!cancelled && !hasAnyCache) {
            completeStep();
            completeStep();
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        completeStep();
        completeStep();
        setLoading(false);
      }
    }

    initSession();

    return () => {
      cancelled = true;
  reset();
    };
  }, [authLoading, vaultOwnerToken, _user?.uid]);

  // =========================================================================
  // FCM: React to consent push notifications (FCM-only architecture)
  // =========================================================================
  useEffect(() => {
    if (!userId) return;

    const handleFCMMessage = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log("📬 [ConsentsPage] FCM message received:", customEvent.detail);

      // Use token from session state or vault context
      const effectiveToken = session?.token || vaultOwnerToken || "";

      // Debounce 600ms to let DB commit and avoid burst refetches
      const timer = setTimeout(() => {
        // Refresh all data when FCM message received
        if (effectiveToken) {
          fetchPendingConsents(userId, effectiveToken, true);
          fetchActiveConsents(userId, effectiveToken, true);
          fetchAuditLog(userId, effectiveToken, true);
        }
      }, 600);

      return () => clearTimeout(timer);
    };

    window.addEventListener(FCM_MESSAGE_EVENT, handleFCMMessage);

    return () => {
      window.removeEventListener(FCM_MESSAGE_EVENT, handleFCMMessage);
    };
  }, [
    userId,
    fetchPendingConsents,
    fetchAuditLog,
    fetchActiveConsents,
    session?.token,

    vaultOwnerToken
  ]);

  // =========================================================================
  // Listen for consent action events from notification toast actions
  // =========================================================================
  useEffect(() => {
    const handleConsentAction = (event: Event) => {
      const customEvent = event as CustomEvent<{
        action: string;
        requestId: string;
      }>;
      console.log(
        `📡 [ConsentsPage] Action event: ${customEvent.detail.action}`
      );

      if (!userId) return;
      const effectiveToken = session?.token || vaultOwnerToken || "";

      // Refresh all tables after action (force refresh)
      if (effectiveToken) {
        fetchPendingConsents(userId, effectiveToken, true);
        fetchActiveConsents(userId, effectiveToken, true);
        fetchAuditLog(userId, effectiveToken, true);
      }
    };

    window.addEventListener("consent-action-complete", handleConsentAction);
    return () =>
      window.removeEventListener(
        "consent-action-complete",
        handleConsentAction
      );
  }, [userId, fetchPendingConsents, fetchActiveConsents, fetchAuditLog, session?.token, vaultOwnerToken]);

  // =========================================================================
  // Unified Actions Hook (Native Compatible)
  // =========================================================================
  const refreshAll = useCallback(() => {
    if (userId) {
      const effectiveToken = session?.token || vaultOwnerToken || "";
      // Force refresh after actions
      const promises: Promise<any>[] = [
        fetchPendingConsents(userId, effectiveToken, true),
        fetchAuditLog(userId, effectiveToken, true),
      ];
      
      if (effectiveToken) {
        promises.push(fetchActiveConsents(userId, effectiveToken, true));
      }
      
      Promise.all(promises);
    }
  }, [userId, fetchPendingConsents, fetchActiveConsents, fetchAuditLog, session?.token, vaultOwnerToken]);


  const {
    handleApprove: hookApprove,
    handleDeny: hookDeny,
    handleRevoke: hookRevoke,
  } = useConsentActions({
    userId,
    onActionComplete: refreshAll,
  });

  const handleApprove = async (requestId: string) => {
    const pendingRequest = pending.find((p) => p.id === requestId);
    if (!pendingRequest) {
      toast.error("Request not found");
      return;
    }
    setActionLoading(requestId);
    try {
      await hookApprove(pendingRequest);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeny = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await hookDeny(requestId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (scope: string) => {
    setActionLoading(`revoke-${scope}`);
    try {
      await hookRevoke(scope);
    } finally {
      setActionLoading(null);
    }
  };

  const getTimeRemaining = (expiresAt: number): string => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return "Expired";

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Badge colors with improved dark mode visibility (higher contrast)
  const getScopeColor = (scope: string): string => {
    const scopeLower = scope.toLowerCase();
    
    // Owner/Full access - purple/violet
    if (isVaultOwnerScope(scope))
      return "bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30";
    
    // Financial scopes - green
    if (scopeLower.includes("finance") || scopeLower.includes("financial") || scopeLower.includes("kai"))
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    
    // Food scopes - orange
    if (scopeLower.includes("food") || scopeLower.includes("dining"))
      return "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30";
    
    // Professional scopes - blue
    if (scopeLower.includes("professional") || scopeLower.includes("career"))
      return "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30";
    
    // All/full access scopes - violet
    if (scopeLower.includes("all") || scopeLower.includes("*"))
      return "bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30";
    
    // Default - neutral with good contrast
    return "bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/30";
  };

  const ownerActiveConsent =
    activeConsents
      .filter((consent) => isVaultOwnerScope(consent.scope))
      .sort((a, b) => (b.issued_at || 0) - (a.issued_at || 0))[0] || null;
  const externalActiveConsents = activeConsents.filter(
    (consent) => !isVaultOwnerScope(consent.scope)
  );
  const ownerScope = ownerActiveConsent?.scope || session?.scope || "vault.owner";
  const ownerExpiresAt = ownerActiveConsent?.expires_at || session?.expiresAt || null;
  const ownerIssuedAt = ownerActiveConsent?.issued_at || null;

  if (loading) {
    return null;
  }

  return (
    <div className="w-full max-w-lg lg:max-w-6xl mx-auto space-y-6 sm:space-y-8 px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-linear-to-r from-(--morphy-primary-start) to-(--morphy-primary-end)">
            <Icon icon={Shield} size="lg" className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Consent Management</h1>
            <p className="text-muted-foreground">
              Control who can access your data
            </p>
          </div>
        </div>
        <Button
          variant="none"
          size="sm"
          onClick={() => {
            if (userId) {
              const effectiveToken = session?.token || vaultOwnerToken || "";
              // Force refresh to bypass cache
              if (effectiveToken) {
                fetchPendingConsents(userId, effectiveToken, true);
                fetchAuditLog(userId, effectiveToken, true);
                fetchActiveConsents(userId, effectiveToken, true);
              }
              toast.success("Refreshed", { duration: 1500 });
            }
          }}
          className="flex items-center gap-2 border p-2 md:px-4"
          title="Refresh"
        >
          <Icon icon={RefreshCw} size="sm" className="shrink-0" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger
            value="pending"
            className="flex items-center gap-2 cursor-pointer"
          >
            <Icon icon={Bell} size="sm" />
            Pending
            {pending.length > 0 && (
              <Badge
                variant="destructive"
                className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="session"
            className="flex items-center gap-2 cursor-pointer"
          >
            <Icon icon={Key} size="sm" />
            Session
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="flex items-center gap-2 cursor-pointer"
          >
            <Icon icon={History} size="sm" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* Pending Requests Tab */}
        <TabsContent value="pending" className="space-y-4 mt-4">
          {pending.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Icon
                  icon={Bell}
                  size={48}
                  className="mx-auto text-gray-400 mb-4"
                />
                <h3 className="text-lg font-semibold">No Pending Requests</h3>
                <p className="text-muted-foreground mt-2">
                  When developers request access to your data, it will appear
                  here.
                </p>
              </CardContent>
            </Card>
          ) : (
            pending.map((request) => (
              <Card key={request.id} className="border-l-4 border-l-orange-500">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {request.developer}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Requested{" "}
                        {new Date(request.requestedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={`${getScopeColor(request.scope)} flex items-center gap-1`}>
                      {renderIcon(formatScopeLocal(request.scope).icon)}
                      {formatScopeLocal(request.scope).label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium">Requesting access to:</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {request.scopeDescription ||
                        formatScopeLocal(request.scope).description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon icon={Clock} size="sm" />
                    Access valid for {request.expiryHours} hours if approved
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={() => handleApprove(request.id)}
                      variant="gradient"
                      className="flex-1 cursor-pointer"
                      disabled={actionLoading === request.id}
                    >
                      {actionLoading === request.id ? (
                        <Icon
                          icon={RefreshCw}
                          size="sm"
                          className="mr-2 animate-spin"
                        />
                      ) : (
                        <Icon icon={Check} size="sm" className="mr-2" />
                      )}
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleDeny(request.id)}
                      variant="none"
                      className="flex-1 border border-destructive text-destructive hover:bg-destructive/10"
                      disabled={actionLoading === request.id}
                    >
                      <Icon icon={X} size="sm" className="mr-2" />
                      Deny
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Active Session Tab */}
        <TabsContent value="session" className="space-y-4 mt-4">
          {/* 1. Owner Session Card */}
          {(session || ownerActiveConsent) && (
            <Card className="border-l-4 border-l-purple-500 bg-purple-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Icon icon={Key} size="md" className="text-purple-600" />
                      Owner Session
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {ownerActiveConsent?.developer
                        ? `Granted to ${ownerActiveConsent.developer}`
                        : "Authenticated via verified request"}
                    </p>
                  </div>
                  <Badge className={`${getScopeColor(ownerScope)} flex items-center gap-1`}>
                    {renderIcon(formatScopeLocal(ownerScope).icon)}
                    {formatScopeLocal(ownerScope).label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-background/50">
                    <p className="text-xs text-muted-foreground">
                      Time Remaining
                    </p>
                    <p className="text-lg font-semibold flex items-center gap-2">
                      <Icon icon={Clock} size="sm" />
                      {ownerExpiresAt
                        ? getTimeRemaining(ownerExpiresAt)
                        : "N/A"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-background/50">
                    <p className="text-xs text-muted-foreground">Expires At</p>
                    <p className="text-sm font-medium">
                      {ownerExpiresAt
                        ? new Date(ownerExpiresAt).toLocaleString()
                        : "N/A"}
                    </p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-background/50">
                  <p className="text-xs text-muted-foreground">Granted At</p>
                  <p className="text-sm font-medium">
                    {ownerIssuedAt ? new Date(ownerIssuedAt).toLocaleString() : "N/A"}
                  </p>
                </div>
                <Button
                  variant="none"
                  onClick={() => handleRevoke(ownerScope)}
                  disabled={actionLoading === `revoke-${ownerScope}`}
                  className="w-full border border-destructive text-destructive hover:bg-destructive/10 cursor-pointer"
                >
                  <Icon icon={Ban} size="sm" className="mr-2" />
                  {actionLoading === `revoke-${ownerScope}`
                    ? "Revoking..."
                    : "Revoke Owner Session"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 2. Active External Consents */}
          {externalActiveConsents.length > 0 ? (
            <div className="space-y-4">
              {externalActiveConsents.map((consent, index) => {
                const scopeInfo = formatScopeLocal(consent.scope);
                const timeRemaining = consent.expires_at
                  ? getTimeRemaining(consent.expires_at)
                  : "N/A";

                return (
                  <Card
                    key={`${consent.scope}-${index}`}
                    className="border-l-4 border-l-green-500"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Icon icon={CheckCircle2} size="md" className="text-green-500" />
                            Active Consent
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {consent.developer || "External Developer"}
                          </p>
                        </div>
                        <Badge className={`${getScopeColor(consent.scope)} flex items-center gap-1`}>
                          {renderIcon(scopeInfo.icon)} {scopeInfo.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">
                          {scopeInfo.description}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">
                            Time Remaining
                          </p>
                          <p className="text-lg font-semibold flex items-center gap-2">
                            <Icon icon={Clock} size="sm" />
                            {timeRemaining}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">
                            Expires At
                          </p>
                          <p className="text-sm font-medium">
                            {consent.expires_at
                              ? new Date(consent.expires_at).toLocaleString()
                              : "N/A"}
                          </p>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">
                          Granted At
                        </p>
                        <p className="text-sm font-medium">
                          {consent.issued_at
                            ? new Date(consent.issued_at).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                      <Button
                        variant="none"
                        onClick={() => handleRevoke(consent.scope)}
                        disabled={actionLoading === `revoke-${consent.scope}`}
                        className="w-full border border-destructive text-destructive hover:bg-destructive/10 cursor-pointer"
                      >
                        <Icon icon={Ban} size="sm" className="mr-2" />
                        {actionLoading === `revoke-${consent.scope}`
                          ? "Revoking..."
                          : "Revoke Access"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            !session && !ownerActiveConsent && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Icon
                    icon={Key}
                    size={48}
                    className="mx-auto text-gray-400 mb-4"
                  />
                  <h3 className="text-lg font-semibold">No Active Sessions</h3>
                  <p className="text-muted-foreground mt-2">
                    Unlock your vault to start a session.
                  </p>
                </CardContent>
              </Card>
            )
          )}
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {auditLog.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Icon
                  icon={History}
                  size={48}
                  className="mx-auto text-gray-400 mb-4"
                />
                <h3 className="text-lg font-semibold">No Audit History</h3>
                <p className="text-muted-foreground mt-2">
                  Consent actions will be recorded here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <AppAuditLog
              auditLog={auditLog as unknown as AuditLogEntry[]}
              activeConsents={activeConsents}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
