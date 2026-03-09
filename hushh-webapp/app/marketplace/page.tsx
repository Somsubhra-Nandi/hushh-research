"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { ROUTES } from "@/lib/navigation/routes";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type MarketplaceInvestor,
  type MarketplaceRia,
} from "@/lib/services/ria-service";

export default function MarketplacePage() {
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<"rias" | "investors">("rias");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [rias, setRias] = useState<MarketplaceRia[]>([]);
  const [investors, setInvestors] = useState<MarketplaceInvestor[]>([]);
  const [iamUnavailable, setIamUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setIamUnavailable(false);
      try {
        if (tab === "rias") {
          const data = await RiaService.searchRias({ query, limit: 20 });
          if (!cancelled) {
            setRias(data);
          }
          return;
        }

        const data = await RiaService.searchInvestors({ query, limit: 20 });
        if (!cancelled) {
          setInvestors(data);
        }
      } catch (error) {
        if (!cancelled) {
          setIamUnavailable(isIAMSchemaNotReadyError(error));
          if (tab === "rias") setRias([]);
          else setInvestors([]);
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
  }, [query, tab]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <h1 className="text-xl font-semibold">Investor + RIA Marketplace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Two-sided discovery with public cards only. Private data remains consent-gated.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("rias")}
          className={`rounded-full px-3 py-1.5 text-sm ${
            tab === "rias"
              ? "bg-foreground text-background"
              : "border border-border text-muted-foreground"
          }`}
        >
          Find RIAs
        </button>
        <button
          type="button"
          onClick={() => setTab("investors")}
          className={`rounded-full px-3 py-1.5 text-sm ${
            tab === "investors"
              ? "bg-foreground text-background"
              : "border border-border text-muted-foreground"
          }`}
        >
          Find Investors
        </button>
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tab === "rias" ? "Search RIAs by name" : "Search investors"}
        className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />

      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : null}
      {iamUnavailable ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Marketplace setup is in progress for this environment.
        </p>
      ) : null}

      {tab === "rias" ? (
        <section className="mt-4 space-y-3">
          {rias.map((ria) => (
            <article key={ria.id} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{ria.display_name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {ria.verification_status}
                    {ria.headline ? ` · ${ria.headline}` : ""}
                  </p>
                </div>
                <Link
                  href={`/ria/workspace/${encodeURIComponent(ria.user_id)}`}
                  className="text-xs font-medium text-foreground/80"
                >
                  Open
                </Link>
              </div>
              {Array.isArray(ria.firms) && ria.firms.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {ria.firms.map((firm) => firm.legal_name).join(" · ")}
                </p>
              ) : null}
            </article>
          ))}

          {rias.length === 0 && !loading && !iamUnavailable ? (
            <p className="text-sm text-muted-foreground">No RIA profiles found.</p>
          ) : null}
        </section>
      ) : (
        <section className="mt-4 space-y-3">
          {investors.map((investor) => (
            <article
              key={investor.user_id}
              className="rounded-2xl border border-border bg-background p-4"
            >
              <h2 className="text-sm font-semibold">{investor.display_name}</h2>
              <p className="text-xs text-muted-foreground">
                {investor.headline || "Opt-in investor profile"}
              </p>
            </article>
          ))}

          {investors.length === 0 && !loading && !iamUnavailable ? (
            <p className="text-sm text-muted-foreground">No investor profiles found.</p>
          ) : null}
        </section>
      )}

      {isAuthenticated ? (
        <div className="mt-6 flex gap-2">
          <Link className="text-sm underline" href={ROUTES.RIA_ONBOARDING}>
            RIA onboarding
          </Link>
          <Link className="text-sm underline" href={ROUTES.RIA_REQUESTS}>
            RIA requests
          </Link>
        </div>
      ) : null}
    </main>
  );
}
