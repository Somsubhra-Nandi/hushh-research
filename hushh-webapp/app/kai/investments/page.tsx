"use client";

import { InvestmentsMasterView } from "@/components/kai/views/investments-master-view";
import { useAuth } from "@/lib/firebase/auth-context";
import { useVault } from "@/lib/vault/vault-context";

export default function KaiInvestmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const { vaultOwnerToken } = useVault();

  if (authLoading || !user) {
    return null;
  }

  return (
    <div className="relative w-full overflow-x-hidden">
      <div className="w-full pb-32">
        <InvestmentsMasterView
          userId={user.uid}
          vaultOwnerToken={vaultOwnerToken ?? ""}
        />
      </div>
    </div>
  );
}
