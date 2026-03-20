import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/navigation/routes";

export default function RiaRequestsAliasPage() {
  redirect(`${ROUTES.CONSENTS}?view=pending`);
}
