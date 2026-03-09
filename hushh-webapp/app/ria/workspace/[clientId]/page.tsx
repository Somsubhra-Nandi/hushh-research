"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { isIAMSchemaNotReadyError, RiaService } from "@/lib/services/ria-service";

interface WorkspacePayload {
  workspace_ready: boolean;
  available_domains: string[];
  domain_summaries: Record<string, unknown>;
  total_attributes: number;
  relationship_status: string;
  scope: string;
}

export default function RiaWorkspacePage() {
  const params = useParams<{ clientId: string }>();
  const clientId = String(params.clientId || "");
  const { user } = useAuth();
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iamUnavailable, setIamUnavailable] = useState(false);

  useEffect(() => {
    if (!user || !clientId) {
      setLoading(false);
      return;
    }

    const currentUser = user;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setIamUnavailable(false);
      try {
        const idToken = await currentUser.getIdToken();
        const payload = await RiaService.getWorkspace(idToken, clientId);
        if (!cancelled) setData(payload);
      } catch (loadError) {
        if (!cancelled) {
          setData(null);
          setIamUnavailable(isIAMSchemaNotReadyError(loadError));
          setError(loadError instanceof Error ? loadError.message : "Failed to load workspace");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [clientId, user]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <h1 className="text-xl font-semibold">RIA Workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">Client: {clientId}</p>

      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading workspace…</p> : null}
      {iamUnavailable ? (
        <p className="mt-4 text-sm text-muted-foreground">
          RIA workspace setup is in progress for this environment.
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {data ? (
        <section className="mt-4 rounded-2xl border border-border bg-background p-4">
          <p className="text-sm font-medium">
            {data.workspace_ready ? "Workspace ready" : "Workspace pending"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.relationship_status} · {data.scope}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Domains: {data.available_domains.join(", ") || "None"}
          </p>
          <p className="text-xs text-muted-foreground">
            Attributes: {data.total_attributes}
          </p>
        </section>
      ) : null}
    </main>
  );
}
