"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { usePersonaState } from "@/lib/persona/persona-context";
import { ROUTES } from "@/lib/navigation/routes";

export function PersonaBootstrapRedirect() {
  const { user, isAuthenticated } = useAuth();
  const { personaState, loading } = usePersonaState();
  const pathname = usePathname();
  const router = useRouter();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user || loading || ranRef.current) {
      return;
    }
    if (pathname !== ROUTES.KAI_HOME && pathname !== ROUTES.RIA_HOME) {
      return;
    }
    if (!personaState) {
      return;
    }

    ranRef.current = true;
    if (pathname === ROUTES.KAI_HOME && personaState.last_active_persona === "ria") {
      router.replace(ROUTES.RIA_HOME);
    }
  }, [isAuthenticated, loading, pathname, personaState, router, user]);

  return null;
}
