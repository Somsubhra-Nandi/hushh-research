"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ClipboardList,
  Clock3,
  FolderKanban,
  Loader2,
  Search,
  Shield,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  RiaCompatibilityState,
  RiaPageShell,
  RiaStatusPanel,
  RiaSurface,
} from "@/components/ria/ria-page-shell";
import { SectionHeader } from "@/components/app-ui/page-sections";
import { SettingsGroup, SettingsRow } from "@/components/profile/settings-ui";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/lib/morphy-ux/button";
import { usePersonaState } from "@/lib/persona/persona-context";
import { ROUTES } from "@/lib/navigation/routes";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type MarketplaceInvestor,
  type RiaRequestBundleRecord,
  type RiaRequestScopeTemplate,
} from "@/lib/services/ria-service";

function formatBundleStatus(status: string) {
  switch (status) {
    case "CONSENT_GRANTED":
      return "Approved";
    case "CONSENT_DENIED":
      return "Denied";
    case "REQUESTED":
      return "Pending";
    case "CANCELLED":
      return "Cancelled";
    case "REVOKED":
      return "Revoked";
    case "TIMEOUT":
      return "Expired";
    default:
      return status.replace(/_/g, " ");
  }
}

function bundleTone(status: string) {
  switch (status) {
    case "CONSENT_GRANTED":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300";
    case "REQUESTED":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300";
    case "CONSENT_DENIED":
    case "CANCELLED":
    case "REVOKED":
      return "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300";
    case "TIMEOUT":
      return "bg-zinc-500/10 text-zinc-700 border-zinc-500/20 dark:text-zinc-300";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatDate(value?: number | null) {
  if (!value) return "Not returned";
  return new Date(value).toLocaleString();
}

export default function RiaRequestsPage() {
  const { user } = useAuth();
  const { riaCapability, riaOnboardingStatus } = usePersonaState();
  const [bundles, setBundles] = useState<RiaRequestBundleRecord[]>([]);
  const [scopeTemplates, setScopeTemplates] = useState<RiaRequestScopeTemplate[]>([]);
  const [investorQuery, setInvestorQuery] = useState("");
  const [investorResults, setInvestorResults] = useState<MarketplaceInvestor[]>([]);
  const [selectedInvestor, setSelectedInvestor] = useState<MarketplaceInvestor | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [iamUnavailable, setIamUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => scopeTemplates.find((item) => item.template_id === selectedTemplateId) || null,
    [scopeTemplates, selectedTemplateId]
  );

  const metrics = useMemo(() => {
    const pending = bundles.filter((item) => item.status === "REQUESTED").length;
    const approved = bundles.filter((item) => item.status === "CONSENT_GRANTED").length;
    const denied = bundles.filter((item) => item.status === "CONSENT_DENIED").length;
    const expired = bundles.filter((item) => item.status === "TIMEOUT").length;
    return { pending, approved, denied, expired };
  }, [bundles]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user || riaCapability === "setup") {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setIamUnavailable(false);
        setError(null);
        const idToken = await user.getIdToken();
        const [nextBundles, nextTemplates] = await Promise.all([
          RiaService.listRequestBundles(idToken),
          RiaService.listRequestScopes(idToken),
        ]);
        if (cancelled) return;
        setBundles(nextBundles);
        setScopeTemplates(nextTemplates);
        setSelectedTemplateId((current) => current || nextTemplates[0]?.template_id || "");
      } catch (loadError) {
        if (cancelled) return;
        setBundles([]);
        setScopeTemplates([]);
        setIamUnavailable(isIAMSchemaNotReadyError(loadError));
        setError(loadError instanceof Error ? loadError.message : "Failed to load request center");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [riaCapability, user]);

  useEffect(() => {
    if (!selectedTemplate) {
      setSelectedScopes([]);
      return;
    }
    setSelectedScopes((current) =>
      current.length > 0 && current.every((scope) => selectedTemplate.scopes.some((item) => item.scope === scope))
        ? current
        : selectedTemplate.scopes.map((item) => item.scope)
    );
  }, [selectedTemplate]);

  useEffect(() => {
    if (!user || investorQuery.trim().length < 2) {
      setInvestorResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timeout = window.setTimeout(async () => {
      try {
        const results = await RiaService.searchInvestors({
          query: investorQuery.trim(),
          limit: 8,
        });
        if (!cancelled) setInvestorResults(results);
      } catch (searchError) {
        if (!cancelled) {
          setInvestorResults([]);
          setError(searchError instanceof Error ? searchError.message : "Failed to search investors");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [investorQuery, user]);

  async function reloadBundles() {
    if (!user) return;
    const idToken = await user.getIdToken();
    const nextBundles = await RiaService.listRequestBundles(idToken);
    setBundles(nextBundles);
  }

  async function onSubmitBundle() {
    if (!user || !selectedInvestor || !selectedTemplateId || selectedScopes.length === 0) return;
    try {
      setSubmitting(true);
      setError(null);
      const idToken = await user.getIdToken();
      const created = await RiaService.createRequestBundle(idToken, {
        subject_user_id: selectedInvestor.user_id,
        scope_template_id: selectedTemplateId,
        selected_scopes: selectedScopes,
        reason: reason.trim() || undefined,
      });
      toast.success("Consent bundle sent", {
        description: `${created.request_count} scopes are now waiting for investor review.`,
      });
      setReason("");
      setInvestorQuery("");
      setInvestorResults([]);
      await reloadBundles();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create request bundle");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RiaPageShell
      eyebrow="Request Center"
      title="Compose, send, and track bundled investor requests"
      description="RIA access now moves as one investor-facing request bundle, while the underlying consent ledger still tracks each scope independently."
      icon={ClipboardList}
      statusPanel={
        iamUnavailable ? null : (
          <RiaStatusPanel
            title="Bundle activity at a glance"
            description="Keep request pressure, approvals, and denials visible before the advisor scans the individual request log."
            items={[
              {
                label: "Pending",
                value: loading ? "..." : String(metrics.pending),
                helper: "Investor review still required",
                tone: metrics.pending > 0 ? "warning" : "neutral",
              },
              {
                label: "Approved",
                value: loading ? "..." : String(metrics.approved),
                helper: "Workspaces ready or recently unlocked",
                tone: metrics.approved > 0 ? "success" : "neutral",
              },
              {
                label: "Denied",
                value: loading ? "..." : String(metrics.denied),
                helper: "Request bundles explicitly declined",
                tone: metrics.denied > 0 ? "critical" : "neutral",
              },
              {
                label: "Expired",
                value: loading ? "..." : String(metrics.expired),
                helper: "Request windows that timed out",
                tone: metrics.expired > 0 ? "warning" : "neutral",
              },
            ]}
          />
        )
      }
      actions={
        <>
          <Button asChild variant="none" effect="fade">
            <Link href={ROUTES.RIA_CLIENTS}>Open clients</Link>
          </Button>
          <Button asChild variant="none" effect="fade">
            <Link href={ROUTES.RIA_PICKS}>Manage picks</Link>
          </Button>
        </>
      }
    >
      {iamUnavailable ? (
        <RiaCompatibilityState
          title="Request bundles are waiting on the IAM rollout"
          description="The UI is ready, but this environment is still missing the RIA IAM schema required for live bundle creation and workspace unlocks."
        />
      ) : null}

      {!iamUnavailable ? (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_1.5fr]">
          <section className="space-y-3">
            <SectionHeader
              eyebrow="Compose bundle"
              title="Select the investor and the scopes up front"
              description="The advisor picks the access scope set and reason. The investor decides the final approval duration later from the consent center."
              icon={Shield}
            />
            <RiaSurface className="space-y-4 p-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Investor
                </p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={investorQuery}
                    onChange={(event) => setInvestorQuery(event.target.value)}
                    className="pl-9"
                    placeholder="Search investors by name"
                  />
                </div>
                {selectedInvestor ? (
                  <div className="rounded-[18px] border border-border/60 bg-background/70 p-3">
                    <p className="text-sm font-medium text-foreground">{selectedInvestor.display_name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedInvestor.headline || "Investor selected for this request bundle."}
                    </p>
                    <Button
                      variant="none"
                      effect="fade"
                      size="sm"
                      className="mt-2"
                      onClick={() => setSelectedInvestor(null)}
                    >
                      Clear selection
                    </Button>
                  </div>
                ) : null}
                {!selectedInvestor && investorResults.length > 0 ? (
                  <SettingsGroup>
                    {investorResults.map((investor) => (
                      <SettingsRow
                        key={investor.user_id}
                        icon={UserRound}
                        title={investor.display_name}
                        description={investor.headline || "Investor marketplace profile"}
                        onClick={() => setSelectedInvestor(investor)}
                      />
                    ))}
                  </SettingsGroup>
                ) : null}
                {searching ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching investors...
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Scope template
                </p>
                <div className="flex flex-wrap gap-2">
                  {scopeTemplates.map((template) => (
                    <Button
                      key={template.template_id}
                      variant={selectedTemplateId === template.template_id ? "blue-gradient" : "none"}
                      effect={selectedTemplateId === template.template_id ? "fill" : "fade"}
                      size="sm"
                      onClick={() => setSelectedTemplateId(template.template_id)}
                    >
                      {template.template_name}
                    </Button>
                  ))}
                </div>
                {selectedTemplate?.description ? (
                  <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                ) : null}
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Included scopes
                </p>
                <div className="space-y-3">
                  {selectedTemplate?.scopes.map((scope) => {
                    const checked = selectedScopes.includes(scope.scope);
                    return (
                      <label
                        key={scope.scope}
                        className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-border/60 bg-background/70 p-3"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) =>
                            setSelectedScopes((current) =>
                              next
                                ? [...new Set([...current, scope.scope])]
                                : current.filter((item) => item !== scope.scope)
                            )
                          }
                        />
                        <span className="min-w-0 space-y-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                            {scope.label}
                            {scope.summary_only ? (
                              <Badge variant="secondary">summary only</Badge>
                            ) : (
                              <Badge variant="outline">workspace access</Badge>
                            )}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {scope.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Why this access is needed
                </p>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Give the investor context for why you need these scopes."
                />
              </div>

              {error ? <p className="text-sm text-red-500">{error}</p> : null}

              <Button
                variant="blue-gradient"
                effect="fill"
                onClick={() => void onSubmitBundle()}
                disabled={
                  submitting ||
                  !selectedInvestor ||
                  !selectedTemplateId ||
                  selectedScopes.length === 0 ||
                  riaOnboardingStatus?.verification_status === "draft"
                }
              >
                {submitting ? "Sending request..." : "Send request bundle"}
              </Button>
            </RiaSurface>
          </section>

          <section className="space-y-3">
            <SectionHeader
              eyebrow="Bundle history"
              title="Pending, approved, denied, and expired requests"
              description="Each investor sees one bundled review flow, while this center preserves the scope-level breakdown and current bundle state."
              icon={FolderKanban}
            />
            {loading ? (
              <RiaSurface className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading request bundles...
                </div>
              </RiaSurface>
            ) : null}
            {!loading && bundles.length === 0 ? (
              <RiaSurface className="p-4 text-sm text-muted-foreground">
                No request bundles yet. Search for an investor and send the first bundle from the left.
              </RiaSurface>
            ) : null}
            <div className="space-y-4">
              {bundles.map((bundle) => (
                <RiaSurface key={bundle.bundle_id} className="space-y-4 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-foreground">
                          {bundle.subject_display_name || bundle.subject_user_id || "Investor"}
                        </p>
                        <Badge className={bundleTone(bundle.status)}>
                          {formatBundleStatus(bundle.status)}
                        </Badge>
                        <Badge variant="secondary">{bundle.request_count} scopes</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {bundle.subject_headline || bundle.bundle_label}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Issued: {formatDate(bundle.issued_at)}</span>
                        <span>Request window: {formatDate(bundle.expires_at)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {bundle.status === "CONSENT_GRANTED" && bundle.subject_user_id ? (
                        <Button asChild variant="blue-gradient" effect="fill" size="sm">
                          <Link href={`${ROUTES.RIA_HOME}/workspace/${encodeURIComponent(bundle.subject_user_id)}`}>
                            Open workspace
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <SettingsGroup>
                    {bundle.requests.map((request) => (
                      <SettingsRow
                        key={request.request_id}
                        icon={request.action === "CONSENT_GRANTED" ? BadgeCheck : Clock3}
                        title={
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{request.scope_metadata?.label || request.scope}</span>
                            <Badge variant="outline" className="border-border/70 bg-background/80 text-[10px] font-semibold uppercase text-muted-foreground">
                              {formatBundleStatus(request.action)}
                            </Badge>
                          </div>
                        }
                        description={
                          request.scope_metadata?.description ||
                          "Scope metadata was not returned for this request."
                        }
                      />
                    ))}
                  </SettingsGroup>
                </RiaSurface>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </RiaPageShell>
  );
}
