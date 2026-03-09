"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { ROUTES } from "@/lib/navigation/routes";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type RiaClientAccess,
} from "@/lib/services/ria-service";

export default function RiaClientsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<RiaClientAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [iamUnavailable, setIamUnavailable] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const currentUser = user;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setIamUnavailable(false);
        const idToken = await currentUser.getIdToken();
        const next = await RiaService.listClients(idToken);
        if (!cancelled) setItems(next);
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          setIamUnavailable(isIAMSchemaNotReadyError(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">RIA Clients</h1>
        <Link href={ROUTES.RIA_REQUESTS} className="text-sm underline">
          New request
        </Link>
      </div>

      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading clients…</p> : null}

      <section className="mt-4 space-y-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {item.investor_display_name || item.investor_user_id}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {item.status}
                  {item.granted_scope ? ` · ${item.granted_scope}` : ""}
                </p>
              </div>
              <Link
                href={`/ria/workspace/${encodeURIComponent(item.investor_user_id)}`}
                className="text-xs font-medium text-foreground/80"
              >
                Workspace
              </Link>
            </div>
          </article>
        ))}
      </section>

      {!loading && iamUnavailable ? (
        <p className="mt-4 text-sm text-muted-foreground">
          RIA workspace setup is in progress for this environment. Investor flows remain available.
        </p>
      ) : null}

      {!loading && !iamUnavailable && items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No client relationships yet.</p>
      ) : null}
    </main>
  );
}
