"use client";

import { FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type RiaRequestRecord,
} from "@/lib/services/ria-service";

export default function RiaRequestsPage() {
  const { user } = useAuth();
  const [subjectUserId, setSubjectUserId] = useState("");
  const [durationHours, setDurationHours] = useState(168);
  const [scopeTemplate, setScopeTemplate] = useState("ria_financial_summary_v1");
  const [items, setItems] = useState<RiaRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iamUnavailable, setIamUnavailable] = useState(false);

  async function loadRequests() {
    if (!user) return;
    try {
      setLoading(true);
      setIamUnavailable(false);
      const idToken = await user.getIdToken();
      const next = await RiaService.listRequests(idToken);
      setItems(next);
    } catch (loadError) {
      setItems([]);
      setIamUnavailable(isIAMSchemaNotReadyError(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setSaving(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      await RiaService.createRequest(idToken, {
        subject_user_id: subjectUserId,
        scope_template_id: scopeTemplate,
        duration_mode: "preset",
        duration_hours: durationHours,
        requester_actor_type: "ria",
        subject_actor_type: "investor",
      });
      setSubjectUserId("");
      await loadRequests();
    } catch (submitError) {
      if (isIAMSchemaNotReadyError(submitError)) {
        setIamUnavailable(true);
      }
      setError(submitError instanceof Error ? submitError.message : "Failed to create request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <h1 className="text-xl font-semibold">RIA Consent Requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Request investor access by scope template and duration policy.
      </p>

      <form className="mt-4 space-y-3 rounded-2xl border border-border bg-background p-4" onSubmit={onSubmit}>
        {iamUnavailable ? (
          <p className="text-sm text-muted-foreground">
            RIA request setup is in progress for this environment.
          </p>
        ) : null}
        <input
          required
          value={subjectUserId}
          onChange={(event) => setSubjectUserId(event.target.value)}
          placeholder="Investor user ID"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          disabled={iamUnavailable}
        />

        <select
          value={scopeTemplate}
          onChange={(event) => setScopeTemplate(event.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          disabled={iamUnavailable}
        >
          <option value="ria_financial_summary_v1">RIA financial summary</option>
          <option value="ria_risk_profile_v1">RIA risk profile</option>
        </select>

        <select
          value={durationHours}
          onChange={(event) => setDurationHours(Number(event.target.value))}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          disabled={iamUnavailable}
        >
          <option value={24}>24h</option>
          <option value={168}>7d</option>
          <option value={720}>30d</option>
          <option value={2160}>90d</option>
        </select>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          type="submit"
          disabled={saving || iamUnavailable}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          {saving ? "Creating..." : "Create request"}
        </button>
      </form>

      <section className="mt-5 space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading requests…</p> : null}
        {items.map((item) => (
          <article key={item.request_id} className="rounded-2xl border border-border bg-background p-4">
            <p className="text-sm font-semibold">{item.request_id}</p>
            <p className="text-xs text-muted-foreground">
              {item.action} · {item.scope} · {item.user_id}
            </p>
          </article>
        ))}
        {!loading && !iamUnavailable && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : null}
      </section>
    </main>
  );
}
