"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  RiaCompatibilityState,
  RiaPageShell,
  RiaStatusPanel,
  RiaSurface,
} from "@/components/ria/ria-page-shell";
import { useAuth } from "@/hooks/use-auth";
import { ROUTES } from "@/lib/navigation/routes";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type RiaOnboardingStatus,
} from "@/lib/services/ria-service";
import { usePersonaState } from "@/lib/persona/persona-context";

const STEPS = [
  "Welcome",
  "Identity",
  "Credentials",
  "Firm",
  "Public Profile",
  "Preferences",
  "Activate",
] as const;

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

const STEP_CONTEXT = [
  {
    decision: "Why should an investor trust this advisor shell at all?",
    detail:
      "Lead with verification and consent boundaries first. The product only earns access after the trust surface is clear.",
  },
  {
    decision: "What name should an investor recognize immediately?",
    detail:
      "Use the professional identity clients already know. This name will carry into the marketplace, invite confirmation, and consent flow.",
  },
  {
    decision: "Can the system verify this advisor against regulatory records?",
    detail:
      "Verification stays fail-closed. If FINRA or SEC verification cannot complete, RIA access remains staged rather than silently enabled.",
  },
  {
    decision: "What firm context helps investors place the advisor correctly?",
    detail:
      "Capture only the primary firm and role here. Additional memberships can be managed later without making onboarding feel like back-office data entry.",
  },
  {
    decision: "What should an investor see before accepting an invite?",
    detail:
      "Keep the public profile brief, specific, and credible. This is the trust layer that appears before any consent request exists.",
  },
  {
    decision: "How should Kai communicate once the advisor is live?",
    detail:
      "Choose a stable default. Avoid deep preference debt during onboarding and leave nuanced tuning for the operational settings surface.",
  },
  {
    decision: "Is the advisor ready to enter the live RIA workspace?",
    detail:
      "Activation should confirm status, not ask for more work. Once submitted, the next step is client acquisition and consent management.",
  },
] as const;

export default function RiaOnboardingPage() {
  const { user } = useAuth();
  const { devRiaBypassAllowed, refresh: refreshPersonaState } = usePersonaState();
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<RiaOnboardingStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iamUnavailable, setIamUnavailable] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [finraCrd, setFinraCrd] = useState("");
  const [secIard, setSecIard] = useState("");
  const [firmName, setFirmName] = useState("");
  const [firmRole, setFirmRole] = useState("");
  const [bio, setBio] = useState("");
  const [strategy, setStrategy] = useState("");
  const [disclosuresUrl, setDisclosuresUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [communicationStyle, setCommunicationStyle] = useState("balanced");
  const [alertCadence, setAlertCadence] = useState("daily_digest");

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setIamUnavailable(false);
        const idToken = await user.getIdToken();
        const next = await RiaService.getOnboardingStatus(idToken);
        if (cancelled) return;
        setStatus(next);
        setDisplayName(next.display_name || "");
        setLegalName(next.legal_name || "");
        setFinraCrd(next.finra_crd || "");
        setSecIard(next.sec_iard || "");
      } catch (loadError) {
        if (!cancelled) {
          setStatus(null);
          setIamUnavailable(isIAMSchemaNotReadyError(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const canProceed = useMemo(() => {
    if (step === 1) return Boolean(displayName.trim());
    if (step === 2) return Boolean(legalName.trim() || displayName.trim());
    if (step === 3) return Boolean(firmName.trim() || step < 3);
    if (step === 4) return Boolean(strategy.trim() || bio.trim() || headline.trim());
    return true;
  }, [bio, displayName, firmName, headline, legalName, step, strategy]);
  const currentStepContext = STEP_CONTEXT[step] ?? STEP_CONTEXT[0];
  const verificationLabel = formatVerificationStatus(status?.verification_status, loading);
  const verificationHelper = status?.latest_verification_event
    ? `${status.latest_verification_event.outcome} • ${new Date(status.latest_verification_event.checked_at).toLocaleDateString()}`
    : status?.verification_status === "draft" || !status?.verification_status
      ? "Verification starts after activation"
      : "Verification updates appear here first";
  const nextUnlock =
    status?.verification_status === "active" || status?.verification_status === "finra_verified"
      ? "RIA workspace available"
      : step === STEPS.length - 1
        ? "Waiting on verification"
        : "Complete onboarding to submit";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setSaving(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const result = await RiaService.submitOnboarding(idToken, {
        display_name: displayName,
        legal_name: legalName || undefined,
        finra_crd: finraCrd || undefined,
        sec_iard: secIard || undefined,
        bio: bio || undefined,
        strategy: strategy || undefined,
        disclosures_url: disclosuresUrl || undefined,
        primary_firm_name: firmName || undefined,
        primary_firm_role: firmRole || undefined,
      });
      setStatus((current) => ({
        ...(current || { exists: true }),
        display_name: displayName,
        legal_name: legalName || undefined,
        finra_crd: finraCrd || undefined,
        sec_iard: secIard || undefined,
        verification_status: result.verification_status,
      }));

      await RiaService.setRiaMarketplaceDiscoverability(idToken, {
        enabled: true,
        headline: headline || undefined,
        strategy_summary: strategy || undefined,
      }).catch(() => null);
      await refreshPersonaState({ force: true });

      setStep(STEPS.length - 1);
    } catch (submitError) {
      if (isIAMSchemaNotReadyError(submitError)) {
        setIamUnavailable(true);
      }
      setError(submitError instanceof Error ? submitError.message : "Failed to submit onboarding");
    } finally {
      setSaving(false);
    }
  }

  async function onDevActivate() {
    if (!user) return;

    setSaving(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const result = await RiaService.activateDevRia(idToken, {
        display_name: displayName || legalName || user.displayName || user.email || "RIA User",
        legal_name: legalName || undefined,
        finra_crd: finraCrd || undefined,
        sec_iard: secIard || undefined,
        bio: bio || undefined,
        strategy: strategy || undefined,
        disclosures_url: disclosuresUrl || undefined,
        primary_firm_name: firmName || undefined,
        primary_firm_role: firmRole || undefined,
      });
      setStatus((current) => ({
        ...(current || { exists: true }),
        display_name: displayName || legalName || user.displayName || user.email || "RIA User",
        legal_name: legalName || undefined,
        finra_crd: finraCrd || undefined,
        sec_iard: secIard || undefined,
        verification_status: result.verification_status,
        dev_ria_bypass_allowed: true,
      }));

      await RiaService.setRiaMarketplaceDiscoverability(idToken, {
        enabled: true,
        headline: headline || undefined,
        strategy_summary: strategy || undefined,
      }).catch(() => null);
      await refreshPersonaState({ force: true });
      setStep(STEPS.length - 1);
    } catch (activateError) {
      if (isIAMSchemaNotReadyError(activateError)) {
        setIamUnavailable(true);
      }
      setError(
        activateError instanceof Error ? activateError.message : "Failed to activate dev RIA"
      );
    } finally {
      setSaving(false);
    }
  }

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <RiaSurface className="bg-gradient-to-br from-primary/10 via-card/95 to-card/88">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
              Verified advisory activation
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              Build trust before you ask for data
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              This onboarding keeps the compliance-heavy work focused and short: identity,
              credentials, firm context, public profile, then activation. Verification stays
              fail-closed the whole time.
            </p>
          </RiaSurface>
        );
      case 1:
        return (
          <RiaSurface>
            <h2 className="text-xl font-semibold text-foreground">Identity</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with the professional name clients should recognize immediately.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Display name
                </span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  placeholder="Manish Sainani"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Legal name
                </span>
                <input
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  placeholder="Full legal entity or adviser name"
                />
              </label>
            </div>
          </RiaSurface>
        );
      case 2:
        return (
          <RiaSurface>
            <h2 className="text-xl font-semibold text-foreground">Credentials</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              FINRA and SEC details are used for real verification. If the provider is unavailable,
              activation stays non-active until a verified response arrives.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  FINRA CRD
                </span>
                <input
                  value={finraCrd}
                  onChange={(event) => setFinraCrd(event.target.value)}
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  placeholder="CRD number"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  SEC IARD
                </span>
                <input
                  value={secIard}
                  onChange={(event) => setSecIard(event.target.value)}
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  placeholder="IARD number"
                />
              </label>
            </div>
          </RiaSurface>
        );
      case 3:
        return (
          <RiaSurface>
            <h2 className="text-xl font-semibold text-foreground">Firm</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Capture the primary firm context now. Verified memberships and discoverability can be
              refined later from the RIA dashboard.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Primary firm
                </span>
                <input
                  value={firmName}
                  onChange={(event) => setFirmName(event.target.value)}
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  placeholder="Firm legal name"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Role title
                </span>
                <input
                  value={firmRole}
                  onChange={(event) => setFirmRole(event.target.value)}
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  placeholder="Founding advisor, partner, CIO..."
                />
              </label>
            </div>
          </RiaSurface>
        );
      case 4:
        return (
          <RiaSurface>
            <h2 className="text-xl font-semibold text-foreground">Public profile</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This becomes the trust layer on marketplace cards and invite confirmations.
            </p>
            <div className="mt-5 space-y-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Headline
                </span>
                <input
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  placeholder="Tax-aware wealth planning for cross-border founders"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Advisory strategy
                </span>
                <textarea
                  value={strategy}
                  onChange={(event) => setStrategy(event.target.value)}
                  className="min-h-28 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm"
                  placeholder="What clients should understand about your style and specialization"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Bio
                </span>
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  className="min-h-24 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm"
                  placeholder="Professional background and client promise"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Disclosures URL
                </span>
                <input
                  value={disclosuresUrl}
                  onChange={(event) => setDisclosuresUrl(event.target.value)}
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  placeholder="https://..."
                />
              </label>
            </div>
          </RiaSurface>
        );
      case 5:
        return (
          <RiaSurface>
            <h2 className="text-xl font-semibold text-foreground">Preferences</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Keep this simple. The first version optimizes for clarity and operational cadence, not
              deep configuration debt.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Communication style
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["concise", "balanced", "detailed"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setCommunicationStyle(option)}
                      className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                        communicationStyle === option
                          ? "bg-foreground text-background"
                          : "border border-border bg-background text-foreground"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Alert cadence
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["live", "daily_digest", "weekly"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAlertCadence(option)}
                      className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                        alertCadence === option
                          ? "bg-foreground text-background"
                          : "border border-border bg-background text-foreground"
                      }`}
                    >
                      {option.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </RiaSurface>
        );
      default:
        return (
          <RiaSurface className="bg-gradient-to-br from-primary/10 via-card/95 to-card/88">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
              Activation state
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {status?.verification_status === "finra_verified" ||
              status?.verification_status === "active"
                ? "Verification passed. RIA mode is ready."
                : "Onboarding submitted. Verification is in progress."}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Communication style is set to <strong>{communicationStyle}</strong> and cadence to{" "}
              <strong>{alertCadence.replace("_", " ")}</strong>. Public profile data is staged, and
              discoverability is enabled unless this environment is still running in compatibility
              mode.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={ROUTES.RIA_HOME}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background"
              >
                Open RIA Home
              </Link>
              <Link
                href={ROUTES.RIA_CLIENTS}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background/60 px-4 text-sm font-medium text-foreground"
              >
                Open Clients
              </Link>
            </div>
          </RiaSurface>
        );
    }
  }

  return (
    <RiaPageShell
      eyebrow="RIA Onboarding"
      title="Verify the advisor before unlocking the workflow"
      description="Progressive disclosure keeps onboarding short: identity, credentials, firm context, and the public trust surface clients will actually see."
      statusPanel={
        iamUnavailable ? null : (
          <RiaStatusPanel
            title="Verification state is the primary control point"
            description="Keep the regulatory status visible while the form moves forward. Investors should never feel that trust state is hidden below the fold."
            items={[
              {
                label: "Verification",
                value: verificationLabel,
                helper: verificationHelper,
                tone: verificationTone(status?.verification_status),
              },
              {
                label: "Step",
                value: `${step + 1} / ${STEPS.length}`,
                helper: STEPS[step],
                tone: "neutral",
              },
              {
                label: "Next unlock",
                value: nextUnlock,
                helper:
                  status?.verification_status === "active" ||
                  status?.verification_status === "finra_verified"
                    ? "Marketplace and client acquisition are available"
                    : "Requests stay gated until trusted status is reached",
                tone:
                  status?.verification_status === "active" ||
                  status?.verification_status === "finra_verified"
                    ? "success"
                    : "warning",
              },
              {
                label: "Profile identity",
                value: displayName || legalName || user?.displayName || "Not set",
                helper: "This name appears in invites and public discovery",
                tone: "neutral",
              },
            ]}
            actions={
              status?.verification_status === "active" || status?.verification_status === "finra_verified" ? (
                <Link
                  href={ROUTES.RIA_HOME}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background"
                >
                  Open RIA Home
                </Link>
              ) : null
            }
          />
        )
      }
    >
      {iamUnavailable ? (
        <RiaCompatibilityState
          title="RIA onboarding is unavailable in this environment"
          description="The app is currently connected to an IAM-incomplete database. The UI is ready, but backend activation still requires the IAM migrations and verification tables."
        />
      ) : null}

      <RiaSurface className="flex flex-wrap items-center gap-3">
        {STEPS.map((label, index) => (
          <div
            key={label}
            className={`flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
              index === step
                ? "bg-foreground text-background"
                : index < step
                  ? "border border-primary/20 bg-primary/10 text-primary"
                  : "border border-border bg-background text-muted-foreground"
            }`}
          >
            {index + 1}. {label}
          </div>
        ))}
      </RiaSurface>

      <RiaSurface className="bg-gradient-to-br from-primary/10 via-card/95 to-card/88">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-foreground">{currentStepContext.decision}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {currentStepContext.detail}
        </p>
      </RiaSurface>

      {!iamUnavailable ? (
        <form className="space-y-5" onSubmit={onSubmit}>
          {renderStep()}

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-3">
            {step < STEPS.length - 1 ? (
              <div className="flex flex-wrap gap-3">
                {step === STEPS.length - 2 && devRiaBypassAllowed ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onDevActivate()}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground disabled:opacity-60"
                  >
                    {saving ? "Activating..." : "Activate Dev RIA"}
                  </button>
                ) : null}
                <button
                  type={step === STEPS.length - 2 ? "submit" : "button"}
                  disabled={!canProceed || saving}
                  onClick={
                    step === STEPS.length - 2
                      ? undefined
                      : () => setStep((value) => Math.min(STEPS.length - 1, value + 1))
                  }
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60"
                >
                  {step === STEPS.length - 2 ? (saving ? "Submitting..." : "Activate RIA mode") : "Continue"}
                </button>
              </div>
            ) : null}
          </div>
        </form>
      ) : null}
    </RiaPageShell>
  );
}
