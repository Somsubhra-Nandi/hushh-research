"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  RiaCompatibilityState,
  RiaPageShell,
  RiaStatusPanel,
  RiaSurface,
} from "@/components/ria/ria-page-shell";
import { SectionHeader } from "@/components/app-ui/page-sections";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/lib/morphy-ux/button";
import { usePersonaState } from "@/lib/persona/persona-context";
import { ROUTES } from "@/lib/navigation/routes";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type RiaClientAccess,
} from "@/lib/services/ria-service";

const STATUS_ORDER = [
  "approved",
  "request_pending",
  "invited",
  "revoked",
  "expired",
  "blocked",
] as const;

function formatVerificationStatus(status?: string | null) {
  switch (status) {
    case "finra_verified":
      return "FINRA verified";
    case "active":
      return "Active";
    case "submitted":
      return "Submitted";
    case "rejected":
      return "Rejected";
    case "draft":
    default:
      return "Draft";
  }
}

function verificationTone(status?: string | null): "neutral" | "warning" | "success" | "critical" {
  switch (status) {
    case "active":
    case "finra_verified":
      return "success";
    case "submitted":
      return "warning";
    case "rejected":
      return "critical";
    case "draft":
    default:
      return "neutral";
  }
}

export default function RiaClientsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { riaCapability, riaOnboardingStatus } = usePersonaState();
  const [items, setItems] = useState<RiaClientAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingInvite, setSavingInvite] = useState(false);
  const [iamUnavailable, setIamUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [lastCreatedInviteToken, setLastCreatedInviteToken] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  function buildInviteLink(inviteToken: string) {
    const invitePath = `/kai/onboarding?invite=${encodeURIComponent(inviteToken)}`;
    if (typeof window === "undefined") return invitePath;
    return `${window.location.origin}${invitePath}`;
  }

  async function loadClients() {
    if (riaCapability === "setup") {
      setLoading(false);
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setIamUnavailable(false);
      const idToken = await user.getIdToken();
      const next = await RiaService.listClients(idToken);
      setItems(next);
    } catch (error) {
      setItems([]);
      setIamUnavailable(isIAMSchemaNotReadyError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (riaCapability === "setup") {
      router.replace(ROUTES.RIA_ONBOARDING);
      return;
    }
  }, [riaCapability, router]);

  useEffect(() => {
    void loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riaCapability, user]);

  async function onCreateInvite() {
    if (!user) return;
    setSavingInvite(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const created = await RiaService.createInvites(idToken, {
        scope_template_id: "ria_financial_summary_v1",
        duration_mode: "preset",
        duration_hours: 168,
        targets: [
          {
            display_name: inviteName || undefined,
            email: inviteEmail || undefined,
            phone: invitePhone || undefined,
            source: "manual",
            delivery_channel: inviteEmail ? "email" : invitePhone ? "sms" : "share_link",
          },
        ],
      });
      const firstInvite = created.items[0];
      if (firstInvite?.invite_token) {
        setLastCreatedInviteToken(firstInvite.invite_token);
      }
      setInviteName("");
      setInviteEmail("");
      setInvitePhone("");
      await loadClients();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Failed to create invite");
    } finally {
      setSavingInvite(false);
    }
  }

  async function copyInviteLink(inviteToken: string, marker: string) {
    try {
      await navigator.clipboard.writeText(buildInviteLink(inviteToken));
      setCopiedInviteId(marker);
      window.setTimeout(() => {
        setCopiedInviteId((current) => (current === marker ? null : current));
      }, 1500);
    } catch {
      setError("Unable to copy the invite link from this browser session.");
    }
  }

  const filteredItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const aIndex = STATUS_ORDER.indexOf((a.status as (typeof STATUS_ORDER)[number]) || "blocked");
      const bIndex = STATUS_ORDER.indexOf((b.status as (typeof STATUS_ORDER)[number]) || "blocked");
      return (aIndex === -1 ? STATUS_ORDER.length : aIndex) - (bIndex === -1 ? STATUS_ORDER.length : bIndex);
    });
    if (filter === "all") return sorted;
    return sorted.filter((item) => item.status === filter);
  }, [filter, items]);
  const approvedCount = items.filter((item) => item.status === "approved").length;
  const inviteCount = items.filter((item) => item.status === "invited").length;
  const pendingCount = items.filter((item) => item.status === "request_pending").length;

  return (
    <RiaPageShell
      eyebrow="Client Roster"
      title="Track every relationship from invite to workspace access"
      description="The roster is the single operational view for invited prospects, pending requests, approved workspaces, and relationships that need reactivation."
      statusPanel={
        iamUnavailable ? null : (
          <RiaStatusPanel
            title="Relationship state before list detail"
            description="Keep verification, approvals, and invite pressure visible before the roster grid. The page should answer whether the advisor is allowed to act before it answers who is in the roster."
            items={[
              {
                label: "Verification",
                value: formatVerificationStatus(riaOnboardingStatus?.verification_status),
                helper:
                  riaOnboardingStatus?.verification_status === "active" ||
                  riaOnboardingStatus?.verification_status === "finra_verified"
                    ? "Requests and workspace access are enabled"
                    : "Client access remains gated until trusted status is reached",
                tone: verificationTone(riaOnboardingStatus?.verification_status),
              },
              {
                label: "Approved",
                value: loading ? "..." : String(approvedCount),
                helper: "Clients with workspace access",
                tone: approvedCount > 0 ? "success" : "neutral",
              },
              {
                label: "Pending",
                value: loading ? "..." : String(pendingCount),
                helper: "Awaiting investor consent",
                tone: pendingCount > 0 ? "warning" : "neutral",
              },
              {
                label: "Invite pipeline",
                value: loading ? "..." : String(inviteCount),
                helper: "Private links not yet converted",
                tone: inviteCount > 0 ? "warning" : "neutral",
              },
            ]}
          />
        )
      }
      actions={
        <Button asChild variant="none" effect="fade">
          <Link href={ROUTES.MARKETPLACE}>Find investors</Link>
        </Button>
      }
    >
      {iamUnavailable ? (
        <RiaCompatibilityState
          title="Client management is waiting on the IAM rollout"
          description="The live database is still missing the RIA IAM tables. The roster UI is ready, but real invites, requests, and workspaces will stay unavailable until the IAM schema is migrated."
        />
      ) : null}

      {!iamUnavailable ? (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_1.8fr]">
            <section className="space-y-3">
              <SectionHeader
                eyebrow="Invite a client"
                title="Start with a private link instead of a raw user ID"
                description="Manual invite creation is available now. CRM and CSV entry points can plug into this same lifecycle later without changing the relationship model."
              />
              <RiaSurface>
                <div className="space-y-3">
                  <Input
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                    placeholder="Client name"
                  />
                  <Input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="Client email"
                  />
                  <Input
                    value={invitePhone}
                    onChange={(event) => setInvitePhone(event.target.value)}
                    placeholder="Client phone"
                  />
                  {error ? <p className="text-sm text-red-500">{error}</p> : null}
                  <Button
                    variant="blue-gradient"
                    effect="fill"
                    onClick={() => void onCreateInvite()}
                    disabled={savingInvite || (!inviteName && !inviteEmail && !invitePhone)}
                  >
                    {savingInvite ? "Creating invite..." : "Create invite link"}
                  </Button>
                  {lastCreatedInviteToken ? (
                    <div className="rounded-[22px] border border-primary/20 bg-primary/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                        Latest invite link
                      </p>
                      <p className="mt-2 break-all text-sm text-foreground">
                        {buildInviteLink(lastCreatedInviteToken)}
                      </p>
                      <Button
                        variant="none"
                        effect="fade"
                        onClick={() => void copyInviteLink(lastCreatedInviteToken, "latest")}
                        className="mt-3"
                      >
                        {copiedInviteId === "latest" ? "Copied" : "Copy link"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </RiaSurface>
            </section>

            <section className="space-y-3">
              <SectionHeader
                eyebrow="Relationship states"
                title="Approved, pending, invited, and recoverable"
              />
              <RiaSurface>
                <div className="flex flex-wrap gap-2">
                  {["all", "approved", "request_pending", "invited", "revoked", "expired"].map(
                    (value) => (
                      <Button
                        key={value}
                        variant={filter === value ? "blue-gradient" : "none"}
                        effect={filter === value ? "fill" : "fade"}
                        size="sm"
                        onClick={() => setFilter(value)}
                      >
                        {value.replace("_", " ")}
                      </Button>
                    )
                  )}
                </div>
              </RiaSurface>
            </section>
          </div>

          <div className="space-y-3">
            {loading ? <p className="text-sm text-muted-foreground">Loading clients…</p> : null}
            {filteredItems.map((item) => (
              <RiaSurface key={item.id} className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-foreground">
                        {item.investor_display_name || item.investor_user_id || "Invited investor"}
                      </p>
                      <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {item.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.acquisition_source || "manual"} ·{" "}
                      {item.investor_headline || item.next_action || "request_access"}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Next action: {item.next_action || "request_access"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.investor_user_id ? (
                      <Button asChild variant="blue-gradient" effect="fill" size="sm">
                        <Link href={`/ria/workspace/${encodeURIComponent(item.investor_user_id)}`}>
                          Workspace
                        </Link>
                      </Button>
                    ) : null}
                    <Button asChild variant="none" effect="fade" size="sm">
                      <Link href={ROUTES.RIA_REQUESTS}>Open activity</Link>
                    </Button>
                    {item.invite_token ? (
                      <Button
                        variant="none"
                        effect="fade"
                        size="sm"
                        onClick={() => void copyInviteLink(item.invite_token || "", String(item.id))}
                      >
                        {copiedInviteId === String(item.id) ? "Copied" : "Copy invite"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {(item.invite_token || item.invite_expires_at || item.consent_expires_at) ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {item.invite_token ? (
                      <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Invite path
                        </p>
                        <p className="mt-2 break-all text-sm text-foreground">
                          {buildInviteLink(item.invite_token)}
                        </p>
                      </div>
                    ) : null}
                    {item.invite_expires_at ? (
                      <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Invite expires
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {new Date(item.invite_expires_at).toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                    {item.consent_expires_at ? (
                      <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Consent expires
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                          {new Date(item.consent_expires_at).toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </RiaSurface>
            ))}
            {!loading && filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No clients in this state yet.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </RiaPageShell>
  );
}
