"use client";

import { FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type RiaOnboardingStatus,
} from "@/lib/services/ria-service";

export default function RiaOnboardingPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<RiaOnboardingStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iamUnavailable, setIamUnavailable] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [finraCrd, setFinraCrd] = useState("");
  const [strategy, setStrategy] = useState("");
  const [firmName, setFirmName] = useState("");

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let cancelled = false;

    async function loadStatus() {
      try {
        setIamUnavailable(false);
        const idToken = await currentUser.getIdToken();
        const next = await RiaService.getOnboardingStatus(idToken);
        if (cancelled) return;
        setStatus(next);
        if (next.display_name) setDisplayName(next.display_name);
        if (next.legal_name) setLegalName(next.legal_name);
        if (next.finra_crd) setFinraCrd(next.finra_crd);
      } catch (loadError) {
        if (!cancelled) {
          setStatus(null);
          setIamUnavailable(isIAMSchemaNotReadyError(loadError));
        }
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setError("Login required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      setIamUnavailable(false);
      await RiaService.submitOnboarding(idToken, {
        display_name: displayName,
        legal_name: legalName || undefined,
        finra_crd: finraCrd || undefined,
        strategy: strategy || undefined,
        primary_firm_name: firmName || undefined,
      });
      const refreshed = await RiaService.getOnboardingStatus(idToken);
      setStatus(refreshed);
    } catch (submitError) {
      if (isIAMSchemaNotReadyError(submitError)) {
        setIamUnavailable(true);
      }
      setError(submitError instanceof Error ? submitError.message : "Failed to submit onboarding");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4">
      <h1 className="text-xl font-semibold">RIA Onboarding</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Verification is fail-closed. Only verified advisors can request investor access.
      </p>

      <div className="mt-4 rounded-2xl border border-border bg-background p-4">
        <p className="text-xs text-muted-foreground">Current verification status</p>
        <p className="mt-1 text-sm font-medium">{status?.verification_status || "draft"}</p>
      </div>

      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        {iamUnavailable ? (
          <p className="text-sm text-muted-foreground">
            RIA onboarding setup is in progress for this environment.
          </p>
        ) : null}
        <input
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Display name"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          disabled={iamUnavailable}
        />
        <input
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
          placeholder="Legal name"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          disabled={iamUnavailable}
        />
        <input
          value={finraCrd}
          onChange={(event) => setFinraCrd(event.target.value)}
          placeholder="FINRA CRD"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          disabled={iamUnavailable}
        />
        <input
          value={firmName}
          onChange={(event) => setFirmName(event.target.value)}
          placeholder="Primary firm name"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          disabled={iamUnavailable}
        />
        <textarea
          value={strategy}
          onChange={(event) => setStrategy(event.target.value)}
          placeholder="Advisory strategy summary"
          className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          disabled={iamUnavailable}
        />

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          type="submit"
          disabled={saving || iamUnavailable}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          {saving ? "Submitting..." : "Submit onboarding"}
        </button>
      </form>
    </main>
  );
}
