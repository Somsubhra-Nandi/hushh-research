import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/navigation/routes";

export default function LegacyKaiDashboardRedirect() {
  redirect(ROUTES.KAI_DASHBOARD);
}
