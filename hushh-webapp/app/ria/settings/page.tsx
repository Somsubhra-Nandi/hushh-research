import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/navigation/routes";

export default function RiaSettingsAliasPage() {
  redirect(ROUTES.RIA_HOME);
}
