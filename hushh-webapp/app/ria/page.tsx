"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, MailPlus, UserRound } from "lucide-react";

import {
  MetricTile,
  RiaCompatibilityState,
  RiaPageShell,
  RiaStatusPanel,
} from "@/components/ria/ria-page-shell";
import { SectionHeader } from "@/components/app-ui/page-sections";
import { SettingsGroup, SettingsRow } from "@/components/profile/settings-ui";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/lib/morphy-ux/button";
import { usePersonaState } from "@/lib/persona/persona-context";
import { ROUTES } from "@/lib/navigation/routes";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type RiaClientAccess,
  type RiaInviteRecord,
  type RiaOnboardingStatus,
  type RiaRequestRecord,
} from "@/lib/services/ria-service";

function describeRequestAction(action: string) {
  switch (action) {
    case "REQUESTED":
      return "Awaiting investor review";
    case "CONSENT_GRANTED":
      return "Consent granted";
    case "CONSENT_DENIED":
      return "Consent denied";
    case "CANCELLED":
      return "Request cancelled";
    case "REVOKED":
      return "Consent revoked";
    case "TIMEOUT":
      return "Request expired";
    default:
      return action;
  }
}

function formatVerificationStatus(status?: string | null, loading?: boolean) {
  if (loading) return "Loading";
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

export default function RiaHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { riaCapability, riaOnboardingStatus } = usePersonaState();
  const [status, setStatus] = useState<RiaOnboardingStatus | null>(null);
  const [clients, setClients] = useState<RiaClientAccess[]>([]);
  const [requests, setRequests] = useState<RiaRequestRecord[]>([]);
  const [invites, setInvites] = useState<RiaInviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [iamUnavailable, setIamUnavailable] = useState(false);

  useEffect(() => {
    if (riaCapability === "setup") {
      router.replace(ROUTES.RIA_ONBOARDING);
      return;
    }
  }, [riaCapability, router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
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
        const [nextStatus, nextClients, nextRequests, nextInvites] = await Promise.all([
          RiaService.getOnboardingStatus(idToken),
          RiaService.listClients(idToken),
          RiaService.listRequests(idToken),
          RiaService.listInvites(idToken),
        ]);
        if (cancelled) return;
        setStatus(nextStatus);
        setClients(nextClients);
        setRequests(nextRequests);
        setInvites(nextInvites);
      } catch (error) {
        if (!cancelled) {
          setStatus(null);
          setClients([]);
          setRequests([]);
          setInvites([]);
          setIamUnavailable(isIAMSchemaNotReadyError(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [riaCapability, user]);

  const metrics = useMemo(() => {
    const activeClients = clients.filter((item) => item.status === "approved").length;
    const pendingRequests = requests.filter((item) => item.action === "REQUESTED").length;
    const openInvites = invites.filter((item) => item.status === "sent").length;
    return {
      activeClients,
      pendingRequests,
      openInvites,
      totalRelationships: clients.length.toString(),
    };
  }, [clients, invites, requests]);

  return (
    <RiaPageShell
      eyebrow="Advisor Workspace"
      title="A consent-first operating system for client relationships"
      description="Verification, requests, client workspace access, and marketplace discovery live in one RIA shell. Private data stays gated until consent is active."
      statusPanel={
        iamUnavailable ? null : (
          <RiaStatusPanel
            title="Verification and access state"
            description="Keep the trust posture visible before the user scans metrics or workflow modules."
            items={[
              {
                label: "Verification",
                value: formatVerificationStatus(
                  (status || riaOnboardingStatus)?.verification_status,
                  loading
                ),
                helper:
                  (status || riaOnboardingStatus)?.verification_status === "active" ||
                  (status || riaOnboardingStatus)?.verification_status === "finra_verified"
                    ? "Requests and workspace access are available"
                    : "Consent requests remain gated until trusted status is reached",
                tone: verificationTone((status || riaOnboardingStatus)?.verification_status),
              },
              {
                label: "Active clients",
                value: loading ? "..." : String(metrics.activeClients),
                helper: "Approved relationships",
                tone: metrics.activeClients > 0 ? "success" : "neutral",
              },
              {
                label: "Pending requests",
                value: loading ? "..." : String(metrics.pendingRequests),
                helper: "Awaiting investor review",
                tone: metrics.pendingRequests > 0 ? "warning" : "neutral",
              },
              {
                label: "Open invites",
                value: loading ? "..." : String(metrics.openInvites),
                helper: "Shared but not yet accepted",
                tone: metrics.openInvites > 0 ? "warning" : "neutral",
              },
            ]}
          />
        )
      }
      actions={
        <>
          <Button asChild variant="blue-gradient" effect="fill">
            <Link href={ROUTES.RIA_REQUESTS}>Open request center</Link>
          </Button>
          <Button asChild variant="none" effect="fade">
            <Link href={ROUTES.RIA_PICKS}>Manage picks</Link>
          </Button>
        </>
      }
    >
      {iamUnavailable ? (
        <RiaCompatibilityState
          title="RIA mode is not active in this environment yet"
          description="The connected database is still in investor compatibility mode. The shell is in place, but onboarding, marketplace, and client workspaces stay unavailable until IAM migrations pass."
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          label="Active Clients"
          value={loading ? "..." : String(metrics.activeClients)}
          helper="Approved relationships"
        />
        <MetricTile
          label="Pending Requests"
          value={loading ? "..." : String(metrics.pendingRequests)}
          helper="Awaiting investor decision"
        />
        <MetricTile
          label="Open Invites"
          value={loading ? "..." : String(metrics.openInvites)}
          helper="Shared but not yet accepted"
        />
        <MetricTile
          label="Relationships"
          value={loading ? "..." : metrics.totalRelationships}
          helper="Total tracked connections"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-3">
          <SectionHeader
            eyebrow="Next Best Action"
            title={
              (status || riaOnboardingStatus)?.verification_status === "active" ||
              (status || riaOnboardingStatus)?.verification_status === "finra_verified"
                ? "Start the next client conversation"
                : "Complete verification and profile setup"
            }
            description={
              (status || riaOnboardingStatus)?.verification_status === "active" ||
              (status || riaOnboardingStatus)?.verification_status === "finra_verified"
                ? "Use the client roster to send invites, move pending relationships forward, and reopen revoked or expired access."
                : "RIA access requests remain blocked until verification reaches a trusted state. Finish onboarding, confirm your firm data, and enable marketplace discoverability from the RIA dashboard."
            }
            actions={
              <Link
                href={
                  (status || riaOnboardingStatus)?.verification_status === "active" ||
                  (status || riaOnboardingStatus)?.verification_status === "finra_verified"
                    ? ROUTES.RIA_CLIENTS
                    : ROUTES.RIA_ONBOARDING
                }
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 px-4 text-sm font-medium text-primary"
              >
                {(status || riaOnboardingStatus)?.verification_status === "active" ||
                (status || riaOnboardingStatus)?.verification_status === "finra_verified"
                  ? "Open clients"
                  : "Resume onboarding"}
              </Link>
            }
          />
        </section>

        <section className="space-y-3">
          <SectionHeader
            eyebrow="Activity"
            title="Recent request movement"
            description="Keep the latest consent and request outcomes visible without burying them inside the roster."
            icon={Clock3}
          />
          <SettingsGroup>
              {requests.slice(0, 4).map((item) => (
                <SettingsRow
                  key={item.request_id}
                  icon={Clock3}
                  title={
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{item.subject_display_name || "Investor"}</span>
                      <Badge variant="outline" className="border-border/70 bg-background/80 text-[10px] font-semibold text-muted-foreground">
                        {describeRequestAction(item.action)}
                      </Badge>
                    </div>
                  }
                  description={item.subject_headline || item.scope}
                />
              ))}
              {!loading && requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No request activity yet. Start from clients or marketplace.
                </p>
              ) : null}
          </SettingsGroup>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-3">
          <SectionHeader
            eyebrow="Client roster"
            title="Latest relationship states"
            icon={UserRound}
            actions={
              <Button asChild variant="none" effect="fade" size="sm">
                <Link href={ROUTES.RIA_CLIENTS}>View all</Link>
              </Button>
            }
          />
          <SettingsGroup>
              {clients.slice(0, 4).map((client) => (
                <SettingsRow
                  key={client.id}
                  icon={UserRound}
                  title={
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{client.investor_display_name || client.investor_user_id || "Invited investor"}</span>
                      <Badge variant="outline" className="border-border/70 bg-background/80 text-[10px] font-semibold uppercase text-muted-foreground">
                        {client.status.replace("_", " ")}
                      </Badge>
                    </div>
                  }
                  description={client.next_action || "request_access"}
                  trailing={
                    client.investor_user_id ? (
                      <Button asChild variant="none" effect="fade" size="sm">
                        <Link href={`/ria/workspace/${encodeURIComponent(client.investor_user_id)}`}>
                          Workspace
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              ))}
              {!loading && clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active client relationships yet.
                </p>
              ) : null}
          </SettingsGroup>
        </section>

        <section className="space-y-3">
          <SectionHeader
            eyebrow="Invite pipeline"
            title="Shared, accepted, and pending"
            icon={MailPlus}
            actions={
              <Button asChild variant="none" effect="fade" size="sm">
                <Link href={ROUTES.RIA_REQUESTS}>View activity</Link>
              </Button>
            }
          />
          <SettingsGroup>
              {invites.slice(0, 4).map((invite) => (
                <SettingsRow
                  key={invite.invite_id}
                  icon={MailPlus}
                  title={invite.target_display_name || invite.target_email || invite.target_phone || "Share link"}
                  description={invite.delivery_channel || "share_link"}
                  trailing={
                    <Badge variant="outline" className="border-border/70 bg-background/80 text-[10px] font-semibold uppercase text-muted-foreground">
                      {invite.status}
                    </Badge>
                  }
                />
              ))}
              {!loading && invites.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No invites sent yet.
                </p>
              ) : null}
          </SettingsGroup>
        </section>
      </div>
    </RiaPageShell>
  );
}
