"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  ClipboardList,
  FileSpreadsheet,
  MailPlus,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { SectionHeader } from "@/components/app-ui/page-sections";
import { SettingsGroup, SettingsRow } from "@/components/profile/settings-ui";
import {
  RiaCompatibilityState,
  RiaPageShell,
  RiaStatusPanel,
  RiaSurface,
} from "@/components/ria/ria-page-shell";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/lib/morphy-ux/button";
import { ROUTES } from "@/lib/navigation/routes";
import { usePersonaState } from "@/lib/persona/persona-context";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type RiaClientAccess,
  type RiaInviteRecord,
  type RiaOnboardingStatus,
  type RiaRequestBundleRecord,
} from "@/lib/services/ria-service";

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

function verificationBadgeClassName(status?: string | null) {
  switch (verificationTone(status)) {
    case "success":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "warning":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "critical":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    default:
      return "border-border/70 bg-background/80 text-muted-foreground";
  }
}

function formatInviteStatus(status?: string | null) {
  return String(status || "pending").replaceAll("_", " ");
}

function heroCopy(status?: string | null) {
  switch (status) {
    case "active":
    case "finra_verified":
      return {
        title: "Your RIA workspace is ready.",
        description:
          "Use Clients to manage relationships, Picks to publish your active list, and Consents to track every approval in one place.",
        actionHref: ROUTES.RIA_CLIENTS,
        actionLabel: "Open clients",
      };
    case "submitted":
      return {
        title: "Verification is still in review.",
        description:
          "The shell is ready, but trusted advisor actions remain gated until the verification review finishes.",
        actionHref: ROUTES.RIA_ONBOARDING,
        actionLabel: "Review onboarding",
      };
    case "rejected":
      return {
        title: "Verification needs an update.",
        description:
          "Refresh the advisor profile before sending new requests or opening investor workspaces.",
        actionHref: ROUTES.RIA_ONBOARDING,
        actionLabel: "Resume onboarding",
      };
    case "draft":
    default:
      return {
        title: "Finish setup before you request access.",
        description:
          "The advisor workspace is available now, but client access stays locked until the RIA profile reaches a trusted state.",
        actionHref: ROUTES.RIA_ONBOARDING,
        actionLabel: "Set up RIA",
      };
  }
}

export default function RiaHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { riaCapability, riaOnboardingStatus } = usePersonaState();

  const [status, setStatus] = useState<RiaOnboardingStatus | null>(null);
  const [clients, setClients] = useState<RiaClientAccess[]>([]);
  const [bundles, setBundles] = useState<RiaRequestBundleRecord[]>([]);
  const [invites, setInvites] = useState<RiaInviteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [iamUnavailable, setIamUnavailable] = useState(false);

  useEffect(() => {
    if (riaCapability === "setup") {
      router.replace(ROUTES.RIA_ONBOARDING);
    }
  }, [riaCapability, router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (riaCapability === "setup" || !user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setIamUnavailable(false);
        const idToken = await user.getIdToken();
        const [nextStatus, nextClients, nextBundles, nextInvites] = await Promise.all([
          RiaService.getOnboardingStatus(idToken),
          RiaService.listClients(idToken),
          RiaService.listRequestBundles(idToken),
          RiaService.listInvites(idToken),
        ]);
        if (cancelled) return;
        setStatus(nextStatus);
        setClients(nextClients);
        setBundles(nextBundles);
        setInvites(nextInvites);
      } catch (error) {
        if (cancelled) return;
        setStatus(null);
        setClients([]);
        setBundles([]);
        setInvites([]);
        setIamUnavailable(isIAMSchemaNotReadyError(error));
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

  const verificationStatus =
    (status || riaOnboardingStatus)?.verification_status || "draft";
  const hero = heroCopy(verificationStatus);

  const metrics = useMemo(() => {
    const connected = clients.filter((client) => client.status === "approved").length;
    const pending = clients.filter((client) => client.status === "request_pending").length;
    const openInvites = invites.filter((invite) => invite.status === "sent").length;
    return {
      connected,
      pending,
      openInvites,
    };
  }, [clients, invites]);

  const recentClients = useMemo(() => clients.slice(0, 3), [clients]);
  const recentBundles = useMemo(() => bundles.slice(0, 3), [bundles]);
  const recentInvites = useMemo(() => invites.slice(0, 3), [invites]);

  return (
    <RiaPageShell
      eyebrow="Advisor Workspace"
      title="RIA"
      description="A lighter workspace for verification, relationships, picks, and consented access."
      icon={BriefcaseBusiness}
      actions={
        <>
          <Button asChild variant="blue-gradient" effect="fill">
            <Link href={ROUTES.CONSENTS}>Open consents</Link>
          </Button>
          <Button asChild variant="none" effect="fade">
            <Link href={ROUTES.RIA_PICKS}>Open picks</Link>
          </Button>
        </>
      }
      statusPanel={
        iamUnavailable ? null : (
          <RiaStatusPanel
            title="Workspace readiness"
            description="Keep verification, relationship state, and invite pressure visible before you drop into the detail routes."
            items={[
              {
                label: "Verification",
                value: formatVerificationStatus(verificationStatus),
                helper:
                  verificationTone(verificationStatus) === "success"
                    ? "Trusted advisor actions are enabled."
                    : "Onboarding still gates requests and workspaces.",
                tone: verificationTone(verificationStatus),
              },
              {
                label: "Connected",
                value: loading ? "..." : String(metrics.connected),
                helper: "Investors with active workspaces.",
                tone: metrics.connected > 0 ? "success" : "neutral",
              },
              {
                label: "Pending",
                value: loading ? "..." : String(metrics.pending),
                helper: "Relationships waiting on review.",
                tone: metrics.pending > 0 ? "warning" : "neutral",
              },
              {
                label: "Invites",
                value: loading ? "..." : String(metrics.openInvites),
                helper: "Join links still waiting to convert.",
                tone: metrics.openInvites > 0 ? "warning" : "neutral",
              },
            ]}
          />
        )
      }
    >
      {iamUnavailable ? (
        <RiaCompatibilityState
          title="RIA mode is still waiting on IAM parity"
          description="The simplified advisor shell is ready, but the active environment still needs the IAM schema before onboarding, requests, and workspaces can behave end to end."
        />
      ) : null}

      {!iamUnavailable ? (
        <>
          <RiaSurface className="space-y-5 bg-gradient-to-br from-primary/7 via-background/96 to-background/92 p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl space-y-3">
                <Badge variant="outline" className={verificationBadgeClassName(verificationStatus)}>
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  {formatVerificationStatus(verificationStatus)}
                </Badge>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {hero.title}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground sm:text-[15px]">
                    {hero.description}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="blue-gradient" effect="fill">
                  <Link href={hero.actionHref}>{hero.actionLabel}</Link>
                </Button>
                <Button asChild variant="none" effect="fade">
                  <Link href={ROUTES.MARKETPLACE}>Open marketplace</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-border/60 bg-background/76 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Clients
                </p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                  {loading ? "..." : clients.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  One roster for connected, pending, and invited relationships.
                </p>
              </div>
              <div className="rounded-[22px] border border-border/60 bg-background/76 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Request bundles
                </p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                  {loading ? "..." : bundles.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Outgoing consent bundles tracked in the shared consent workspace.
                </p>
              </div>
              <div className="rounded-[22px] border border-border/60 bg-background/76 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Active list
                </p>
                <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                  Picks
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Publish one active advisor list that connected investors can compare against.
                </p>
              </div>
            </div>
          </RiaSurface>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-4">
              <SectionHeader
                eyebrow="Workspace"
                title="Primary routes"
                description="Keep navigation simple: relationships, consents, and picks."
                icon={BriefcaseBusiness}
              />
              <SettingsGroup>
                <SettingsRow
                  icon={UserRound}
                  title="Clients"
                  description="Review connected investors, pending approvals, invites, and next actions in one roster."
                  trailing={
                    <Button asChild variant="none" effect="fade" size="sm">
                      <Link href={ROUTES.RIA_CLIENTS}>Open</Link>
                    </Button>
                  }
                />
                <SettingsRow
                  icon={ClipboardList}
                  title="Consents"
                  description="Use the shared consent workspace for request bundles, invites, approvals, and active access."
                  trailing={
                    <Button asChild variant="none" effect="fade" size="sm">
                      <Link href={ROUTES.CONSENTS}>Open</Link>
                    </Button>
                  }
                />
                <SettingsRow
                  icon={FileSpreadsheet}
                  title="Picks"
                  description="Upload the active advisor list, download the template, and keep upload history clean."
                  trailing={
                    <Button asChild variant="none" effect="fade" size="sm">
                      <Link href={ROUTES.RIA_PICKS}>Open</Link>
                    </Button>
                  }
                />
              </SettingsGroup>

              <SectionHeader
                eyebrow="Relationships"
                title="Recent client activity"
                description="A lightweight snapshot of who is ready and who needs the next step."
                icon={UserRound}
              />
              <SettingsGroup>
                {recentClients.length === 0 && !loading ? (
                  <div className="px-4 py-4 text-sm text-muted-foreground">
                    No RIA relationships yet.
                  </div>
                ) : (
                  recentClients.map((client) => (
                    <SettingsRow
                      key={client.id}
                      icon={UserRound}
                      title={
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {client.investor_display_name ||
                              client.investor_user_id ||
                              "Investor"}
                          </span>
                          <Badge variant="outline" className={verificationBadgeClassName(client.status)}>
                            {client.status.replaceAll("_", " ")}
                          </Badge>
                          {client.is_self_relationship ? (
                            <Badge variant="secondary">Self</Badge>
                          ) : null}
                        </div>
                      }
                      description={client.investor_headline || client.next_action || "Review relationship"}
                      trailing={
                        client.investor_user_id ? (
                          <Button asChild variant="none" effect="fade" size="sm">
                            <Link
                              href={`/ria/workspace/${encodeURIComponent(client.investor_user_id)}`}
                            >
                              Open
                            </Link>
                          </Button>
                        ) : undefined
                      }
                    />
                  ))
                )}
              </SettingsGroup>
            </section>

            <section className="space-y-4">
              <SectionHeader
                eyebrow="Consent"
                title="Latest bundle movement"
                description="Keep request outcomes close without turning the home screen into a second operations dashboard."
                icon={ClipboardList}
              />
              <SettingsGroup>
                {recentBundles.length === 0 && !loading ? (
                  <div className="px-4 py-4 text-sm text-muted-foreground">
                    No consent bundles yet.
                  </div>
                ) : (
                  recentBundles.map((bundle) => (
                    <SettingsRow
                      key={bundle.bundle_id}
                      icon={ClipboardList}
                      title={bundle.subject_display_name || "Investor"}
                      description={bundle.bundle_label}
                      trailing={
                        <Badge variant="outline" className={verificationBadgeClassName(bundle.status)}>
                          {bundle.status.replaceAll("_", " ")}
                        </Badge>
                      }
                    />
                  ))
                )}
              </SettingsGroup>

              <SectionHeader
                eyebrow="Invite pipeline"
                title="Recent invites"
                description="Kai email invites and share links stay visible here until they convert into live relationships."
                icon={MailPlus}
              />
              <SettingsGroup>
                {recentInvites.length === 0 && !loading ? (
                  <div className="px-4 py-4 text-sm text-muted-foreground">
                    No invites have been sent yet.
                  </div>
                ) : (
                  recentInvites.map((invite) => (
                    <SettingsRow
                      key={invite.invite_id}
                      icon={MailPlus}
                      title={
                        invite.target_display_name ||
                        invite.target_email ||
                        invite.target_phone ||
                        "Invite"
                      }
                      description={invite.delivery_channel || "share link"}
                      trailing={
                        <Badge variant="outline" className={verificationBadgeClassName(invite.status)}>
                          {formatInviteStatus(invite.status)}
                        </Badge>
                      }
                    />
                  ))
                )}
              </SettingsGroup>
            </section>
          </div>
        </>
      ) : null}
    </RiaPageShell>
  );
}
