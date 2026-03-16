import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/navigation/routes";

export default async function RiaRequestsAliasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  const params = new URLSearchParams();
  const view = resolvedSearchParams.view;

  if (typeof view === "string" && view.trim()) {
    params.set("view", view.trim());
  } else {
    params.set("view", "pending");
  }

  redirect(`${ROUTES.CONSENTS}?${params.toString()}`);
}
