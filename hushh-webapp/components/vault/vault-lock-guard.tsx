"use client";

/**
 * VaultLockGuard - Protects routes requiring vault access
 * ========================================================
 *
 * SECURITY: Detects when user is authenticated but vault is locked
 * (e.g., after page refresh - React state resets but Firebase persists)
 *
 * Flow:
 * - Auth ❌ → Redirect to login
 * - Auth ✅ + Vault ❌ → Show passphrase unlock dialog
 * - Auth ✅ + Vault ✅ → Render children
 *
 * SECURITY MODEL (BYOK Compliant):
 * - The vault key is stored ONLY in React state (memory).
 * - On page refresh, React state resets, so the vault key is lost.
 * - We ONLY trust `isVaultUnlocked` from VaultContext (which checks memory state).
 * - We render children immediately if vault is unlocked (no intermediate states).
 * - Module-level flag tracks unlock across route changes within same session.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useVault } from "@/lib/vault/vault-context";
import { VaultService } from "@/lib/services/vault-service";
import { VaultFlow } from "./vault-flow";
import { HushhLoader } from "@/components/app-ui/hushh-loader";
import { useStepProgress } from "@/lib/progress/step-progress-context";

// ============================================================================
// Types
// ============================================================================

interface VaultLockGuardProps {
  children: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

export function VaultLockGuard({ children }: VaultLockGuardProps) {
  const router = useRouter();
  const { isVaultUnlocked } = useVault();
  const { user, loading: authLoading } = useAuth();
  const { beginTask, completeTaskStep, endTask } = useStepProgress();
  const [hasVault, setHasVault] = useState<boolean | null>(null);
  const authStepDoneRef = useRef(false);
  const vaultStepDoneRef = useRef(false);
  const PROGRESS_SCOPE = "vault-lock-guard";

  // Redirect unauthenticated users (side-effect outside render)
  useEffect(() => {
    if (authLoading) return;
    if (user) return;

    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (isVaultUnlocked) {
      endTask(PROGRESS_SCOPE);
      authStepDoneRef.current = false;
      vaultStepDoneRef.current = false;
      return;
    }
    beginTask(PROGRESS_SCOPE, 2);
    authStepDoneRef.current = false;
    vaultStepDoneRef.current = false;
    return () => {
      endTask(PROGRESS_SCOPE);
    };
  }, [beginTask, endTask, isVaultUnlocked]);

  useEffect(() => {
    if (isVaultUnlocked || authLoading || authStepDoneRef.current) return;
    completeTaskStep(PROGRESS_SCOPE);
    authStepDoneRef.current = true;
    if (!user) {
      endTask(PROGRESS_SCOPE);
    }
  }, [authLoading, completeTaskStep, endTask, isVaultUnlocked, user]);

  useEffect(() => {
    let cancelled = false;

    async function checkVaultPresence() {
      if (authLoading || !user || isVaultUnlocked) return;

      vaultStepDoneRef.current = false;
      setHasVault(null);
      try {
        const exists = await VaultService.checkVault(user.uid);
        if (!cancelled) {
          setHasVault(exists);
        }
      } catch (error) {
        console.warn("[VaultLockGuard] Failed to check vault existence:", error);
        if (!cancelled) {
          // Fail closed on transient check failures to preserve existing secure behavior.
          setHasVault(true);
        }
      }
    }

    void checkVaultPresence();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.uid, isVaultUnlocked]);

  useEffect(() => {
    if (isVaultUnlocked || authLoading || !user || hasVault === null || vaultStepDoneRef.current) {
      return;
    }
    completeTaskStep(PROGRESS_SCOPE);
    vaultStepDoneRef.current = true;
    endTask(PROGRESS_SCOPE);
  }, [authLoading, completeTaskStep, endTask, hasVault, isVaultUnlocked, user]);

  // ============================================================================
  // FAST PATH: If vault is unlocked (in memory), render children immediately
  // This eliminates flicker on route changes - no state, no effects, just render
  // ============================================================================
  if (isVaultUnlocked) {
    return <>{children}</>;
  }

  // ============================================================================
  // SLOW PATH: Vault not unlocked, need to check auth and show appropriate UI
  // ============================================================================
  
  // Auth still loading - show loader
  if (authLoading) {
    return <HushhLoader label="Checking session..." />;
  }

  // No user - redirect to login
  if (!user) {
    return <HushhLoader label="Redirecting to login..." />;
  }

  if (hasVault === null) {
    return <HushhLoader label="Checking vault..." />;
  }

  if (hasVault === false) {
    return <>{children}</>;
  }

  // User exists but vault is locked - show unlock dialog
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-sm sm:max-w-md">
        <VaultFlow
          user={user}
          enableGeneratedDefault
          onSuccess={() => {
            // Force a router refresh to ensure state update is picked up
            // This handles potential race conditions on native
            router.refresh(); 
          }}
        />
      </div>
    </div>
  );
}
