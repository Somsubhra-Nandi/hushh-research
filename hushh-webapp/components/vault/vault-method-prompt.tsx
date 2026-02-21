"use client";

import { useEffect, useMemo, useState } from "react";
import { Fingerprint, KeyRound } from "lucide-react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { useVault } from "@/lib/vault/vault-context";
import {
  type VaultMethod,
  VaultMethodService,
} from "@/lib/services/vault-method-service";
import { VaultMethodPromptLocalService } from "@/lib/services/vault-method-prompt-local-service";
import { KaiNavTourLocalService } from "@/lib/services/kai-nav-tour-local-service";
import { Button } from "@/lib/morphy-ux/button";
import { Icon } from "@/lib/morphy-ux/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface VaultMethodPromptProps {
  enabled: boolean;
}

function readableMethod(method: VaultMethod): string {
  if (method === "generated_default_native_biometric") return "device biometric";
  if (method === "generated_default_web_prf") return "passkey";
  return "passphrase";
}

export function VaultMethodPrompt({ enabled }: VaultMethodPromptProps) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { vaultKey, isVaultUnlocked } = useVault();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [targetMethod, setTargetMethod] = useState<VaultMethod | null>(null);

  const canEvaluate = enabled && !loading && !!user?.uid && isVaultUnlocked && !!vaultKey;

  useEffect(() => {
    let cancelled = false;

    async function evaluatePrompt() {
      if (!canEvaluate || !user?.uid) {
        if (!cancelled) {
          setOpen(false);
          setTargetMethod(null);
        }
        return;
      }

      try {
        // Avoid stacking prompts on top of the first-time /kai nav tour.
        if (pathname === "/kai") {
          const navTourState = await KaiNavTourLocalService.load(user.uid);
          if (
            !navTourState?.completed_at &&
            !navTourState?.skipped_at
          ) {
            setOpen(false);
            setTargetMethod(null);
            return;
          }
        }

        const [currentMethod, capability, localState] = await Promise.all([
          VaultMethodService.getCurrentMethod(user.uid),
          VaultMethodService.getCapabilityMatrix(),
          VaultMethodPromptLocalService.load(user.uid),
        ]);

        if (cancelled) return;

        if (currentMethod !== "passphrase") {
          setOpen(false);
          setTargetMethod(null);
          return;
        }

        if (capability.recommendedMethod === "passphrase") {
          setOpen(false);
          setTargetMethod(null);
          return;
        }

        if (
          localState?.dismissed_for_method === capability.recommendedMethod
        ) {
          setOpen(false);
          setTargetMethod(capability.recommendedMethod as VaultMethod);
          return;
        }

        setTargetMethod(capability.recommendedMethod as VaultMethod);
        setOpen(true);
      } catch (error) {
        console.warn("[VaultMethodPrompt] Skipping method prompt:", error);
      }
    }

    void evaluatePrompt();

    return () => {
      cancelled = true;
    };
  }, [canEvaluate, pathname, user?.uid]);

  const title = useMemo(() => {
    if (!targetMethod) return "Enable faster unlock";
    if (targetMethod === "generated_default_native_biometric") {
      return "Use biometric unlock";
    }
    return "Use passkey unlock";
  }, [targetMethod]);

  const description = useMemo(() => {
    if (!targetMethod) return "Switch from passphrase unlock to a faster secure method.";
    if (targetMethod === "generated_default_native_biometric") {
      return "Use device biometric authentication first, with passphrase and recovery key as fallback.";
    }
    return "Use passkey authentication first, with passphrase and recovery key as fallback.";
  }, [targetMethod]);

  async function handleNotNow() {
    if (!user?.uid || !targetMethod) {
      setOpen(false);
      return;
    }

    await VaultMethodPromptLocalService.dismiss(user.uid, targetMethod);
    setOpen(false);
  }

  async function handleEnable() {
    if (!user?.uid || !vaultKey || !targetMethod) return;

    setBusy(true);
    try {
      const result = await VaultMethodService.switchMethod({
        userId: user.uid,
        currentVaultKey: vaultKey,
        displayName: user.displayName || user.email || "Hushh User",
        targetMethod,
      });
      await VaultMethodPromptLocalService.dismiss(user.uid, result.method);
      toast.success(`Vault unlock updated to ${readableMethod(result.method)}.`);
      setOpen(false);
    } catch (error) {
      console.error("[VaultMethodPrompt] Failed to switch method:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update unlock method."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon
              icon={targetMethod === "generated_default_web_prf" ? KeyRound : Fingerprint}
              size="md"
              className="text-[var(--brand-600)]"
            />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="none"
            effect="fade"
            size="default"
            onClick={() => void handleNotNow()}
            disabled={busy}
          >
            Not now
          </Button>
          <Button
            variant="blue-gradient"
            effect="fill"
            size="default"
            onClick={() => void handleEnable()}
            disabled={busy}
          >
            {busy ? "Enabling..." : "Enable now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
