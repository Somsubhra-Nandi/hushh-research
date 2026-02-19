"use client";

import { useState, useEffect } from "react";
import { Button, Card, CardContent } from "@/lib/morphy-ux/morphy";
import {
  Lock,
  Loader2,
  AlertCircle,
  Key,
  Check,
  Copy,
  Download,
  Shield,
  ArrowRight,
  Fingerprint,
} from "lucide-react";
import { VaultService } from "@/lib/services/vault-service";
import { downloadTextFile } from "@/lib/utils/native-download";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { User } from "firebase/auth";

import { useVault } from "@/lib/vault/vault-context";
import { HushhLoader } from "@/components/ui/hushh-loader";
import { Icon } from "@/lib/morphy-ux/ui";
import type { GeneratedVaultKeyMode } from "@/lib/services/vault-bootstrap-service";
import { VaultMethodService, type VaultMethod } from "@/lib/services/vault-method-service";

type VaultStep =
  | "checking"
  | "intro"
  | "create"
  | "unlock"
  | "recovery"
  | "method"
  | "success";
type VaultMode = "passphrase" | GeneratedVaultKeyMode;

interface VaultFlowProps {
  user: User;
  onSuccess: (meta?: { mode: VaultMode }) => void;
  // Callback to inform parent about current step (e.g. to hide headers)
  onStepChange?: (step: VaultStep) => void;
  enableGeneratedDefault?: boolean;
}

export function VaultFlow({
  user,
  onSuccess,
  onStepChange,
  enableGeneratedDefault = false,
}: VaultFlowProps) {
  const [step, setStep] = useState<VaultStep>("checking");
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [recoveryKey, setRecoveryKey] = useState<string>("");
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [vaultMode, setVaultMode] = useState<VaultMode>("passphrase");
  const [pendingUnlockKey, setPendingUnlockKey] = useState<string | null>(null);
  const [recommendedQuickMethod, setRecommendedQuickMethod] =
    useState<VaultMethod | null>(null);

  const { unlockVault } = useVault();

  // Notify parent of step changes
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const isGeneratedVaultMode =
    vaultMode === "generated_default_native_biometric" ||
    vaultMode === "generated_default_web_prf";

  const generatedUnlockLabel =
    vaultMode === "generated_default_web_prf"
      ? "Unlock with passkey"
      : vaultMode === "generated_default_native_biometric"
        ? "Unlock with device security"
        : "Unlock";

  const finalizeUnlock = async (decryptedKey: string): Promise<boolean> => {
    try {
      const { token, expiresAt } = await VaultService.getOrIssueVaultOwnerToken(user.uid);
      VaultService.setVaultCheckCache(user.uid, true);
      unlockVault(decryptedKey, token, expiresAt);
      setStep("success");
      setTimeout(() => onSuccess({ mode: vaultMode }), 1000);
      return true;
    } catch (tokenError) {
      console.error("Failed to issue VAULT_OWNER token:", tokenError);
      toast.error("Vault unlocked but failed to issue access token. Please try again.");
      return false;
    }
  };

  // Initial Vault Status Check
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const hasVault = await VaultService.checkVault(user.uid);
        if (!hasVault) {
          setVaultMode("passphrase");
          setStep("intro");
          return;
        }

        try {
          const vaultData = await VaultService.getVault(user.uid);
          if (
            vaultData.keyMode === "generated_default_native_biometric" ||
            vaultData.keyMode === "generated_default_web_prf"
          ) {
            setVaultMode(vaultData.keyMode);
          } else if (
            vaultData.authMethod === "generated_default_native_biometric" ||
            vaultData.authMethod === "generated_default_web_prf"
          ) {
            setVaultMode(vaultData.authMethod);
          } else {
            setVaultMode("passphrase");
          }
        } catch (metadataError) {
          console.warn("Vault mode detection failed, defaulting to passphrase:", metadataError);
          setVaultMode("passphrase");
        }

        setStep("unlock");
      } catch (err) {
        console.error("Vault status check failed:", err);
        setError("Failed to check vault status. Please retry.");
      }
    };
    checkStatus();
  }, [user.uid]);

  const handleCreatePassphrase = async () => {
    if (passphrase.length < 8) {
      toast.error("Passphrase must be at least 8 characters");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      toast.error("Passphrases do not match");
      return;
    }

    setIsUnlocking(true);
    try {
      setError(null);
      // 1. Generate encrypted vault data
      const vaultData = await VaultService.createVault(passphrase);

      // 2. Save to backend
      await VaultService.setupVault(user.uid, {
        ...vaultData,
        authMethod: "passphrase",
      });

      setVaultMode("passphrase");
      VaultService.setVaultCheckCache(user.uid, true);
      setRecoveryKey(vaultData.recoveryKey);
      setStep("recovery"); // Show recovery key dialog
    } catch (err: any) {
      console.error("Create vault error:", err);
      toast.error(err.message || "Failed to create vault");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCreateGeneratedDefault = async () => {
    if (!enableGeneratedDefault) return;

    setIsUnlocking(true);
    try {
      setError(null);

      const support = await VaultService.canUseGeneratedDefaultVault();
      if (!support.supported) {
        toast.error(support.reason);
        setStep("create");
        return;
      }

      const generated = await VaultService.provisionGeneratedDefaultVault({
        userId: user.uid,
        displayName: user.displayName || user.email || "Hushh User",
      });

      await VaultService.setupVault(user.uid, {
        authMethod: generated.authMethod,
        keyMode: generated.mode,
        encryptedVaultKey: generated.encryptedVaultKey,
        salt: generated.salt,
        iv: generated.iv,
        recoveryEncryptedVaultKey: generated.recoveryEncryptedVaultKey,
        recoverySalt: generated.recoverySalt,
        recoveryIv: generated.recoveryIv,
        passkeyCredentialId: generated.passkeyCredentialId,
        passkeyPrfSalt: generated.passkeyPrfSalt,
      });

      setVaultMode(generated.mode);
      VaultService.setVaultCheckCache(user.uid, true);
      setRecoveryKey(generated.recoveryKey);
      setStep("recovery");
      toast.info("Secure default vault prepared. Save your recovery key to continue.");
    } catch (err: any) {
      console.error("Create generated vault error:", err);
      toast.error(err?.message || "Failed to create secure default vault");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleUnlockPassphrase = async () => {
    setIsUnlocking(true);
    try {
      setError(null);
      const vaultData = await VaultService.getVault(user.uid);
      const decryptedKey = await VaultService.unlockVault(
        passphrase,
        vaultData.encryptedVaultKey,
        vaultData.salt,
        vaultData.iv
      );

      if (decryptedKey) {
        await finalizeUnlock(decryptedKey);
      } else {
        const message = "Invalid passphrase. Please try again.";
        setError(message);
        toast.error(message);
      }
    } catch (err: any) {
      console.error("Unlock error:", err);
      const message = "Failed to unlock vault. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleUnlockGeneratedDefault = async () => {
    setIsUnlocking(true);
    try {
      setError(null);
      const vaultData = await VaultService.getVault(user.uid);
      const decryptedKey = await VaultService.unlockGeneratedDefaultVault({
        userId: user.uid,
        encryptedVaultKey: vaultData.encryptedVaultKey,
        salt: vaultData.salt,
        iv: vaultData.iv,
        keyMode: vaultData.keyMode,
        authMethod: vaultData.authMethod,
        passkeyCredentialId: vaultData.passkeyCredentialId,
        passkeyPrfSalt: vaultData.passkeyPrfSalt,
      });

      if (!decryptedKey) {
        throw new Error("Generated vault mode unavailable. Use passphrase.");
      }

      await finalizeUnlock(decryptedKey);
    } catch (err: any) {
      console.error("Generated vault unlock failed:", err);
      const message = err?.message || "Failed to unlock with secure default key.";
      setError(message);
      toast.error(message);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleRecoveryKeySubmit = async () => {
    setIsUnlocking(true);
    try {
      setError(null);
      const vaultData = await VaultService.getVault(user.uid);
      const decryptedKey = await VaultService.unlockVaultWithRecoveryKey(
        recoveryKeyInput,
        vaultData.recoveryEncryptedVaultKey,
        vaultData.recoverySalt,
        vaultData.recoveryIv
      );

      if (decryptedKey) {
        await finalizeUnlock(decryptedKey);
      } else {
        const message = "Invalid recovery key. Please try again.";
        setError(message);
        toast.error(message);
      }
    } catch (err: unknown) {
      console.error("Recovery key unlock failed:", err);
      const message = "Failed to unlock with recovery key. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCopyRecoveryKey = () => {
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    toast.success("Recovery key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRecoveryKeyContinue = async () => {
    try {
      // Auto-unlock now that unique key is saved
      const vaultData = await VaultService.getVault(user.uid);
      let decryptedKey = await VaultService.unlockGeneratedDefaultVault({
        userId: user.uid,
        encryptedVaultKey: vaultData.encryptedVaultKey,
        salt: vaultData.salt,
        iv: vaultData.iv,
        keyMode: vaultData.keyMode,
        authMethod: vaultData.authMethod,
        passkeyCredentialId: vaultData.passkeyCredentialId,
        passkeyPrfSalt: vaultData.passkeyPrfSalt,
      });

      if (!decryptedKey && passphrase) {
        decryptedKey = await VaultService.unlockVault(
          passphrase,
          vaultData.encryptedVaultKey,
          vaultData.salt,
          vaultData.iv
        );
      }

      if (!decryptedKey) {
        throw new Error("Auto-unlock returned empty vault key.");
      }

      // Post-create optional method upsell: keep a single active KEK, but allow
      // immediate switch to quick unlock before entering the app.
      if (vaultMode === "passphrase" && enableGeneratedDefault) {
        const capability = await VaultMethodService.getCapabilityMatrix();
        if (capability.recommendedMethod !== "passphrase") {
          setPendingUnlockKey(decryptedKey);
          setRecommendedQuickMethod(capability.recommendedMethod);
          setStep("method");
          return;
        }
      }

      const finalized = await finalizeUnlock(decryptedKey);
      if (!finalized) return;
    } catch (err) {
      console.error("Auto-unlock after creation failed", err);
      // If auto-unlock fails, send user to unlock screen to try manually.
      toast.error(
        vaultMode === "passphrase"
          ? "Auto-unlock failed. Please enter your passphrase."
          : "Auto-unlock failed. Try secure unlock or recovery key."
      );
      setStep("unlock");
      return;
    }
  };

  if (step === "checking") {
    if (error) {
      return (
        <Card variant="none" effect="glass">
          <CardContent className="p-6 text-center py-8">
            <div className="space-y-4">
              <div className="text-destructive mb-2">
                <Icon icon={AlertCircle} size={32} className="mx-auto" />
              </div>
              <p className="text-muted-foreground">{error}</p>
              <Button
                onClick={() => window.location.reload()}
                variant="none"
                className="border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return <HushhLoader label="Checking vault status..." />;
  }

  return (
    <>
      <Card variant="none" effect="glass">
        <CardContent className="p-6 space-y-4">
          {/* Intro / Education Step */}
          {step === "intro" && (
            <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-center mb-4">
                <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Icon icon={Shield} size={40} className="text-primary" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-bold tracking-tight">Secure Your Digital Vault</h3>
                <p className="text-muted-foreground text-balance max-w-sm mx-auto">
                  Hushh uses end-to-end encryption to protect your personal data.
                  If you skip custom setup, Kai generates a secure default key and still encrypts your data.
                </p>
              </div>

              <div className="text-left bg-muted/50 rounded-xl p-4 space-y-3 text-sm border border-border/50">
                <div className="flex gap-3">
                  <div className="mt-0.5 min-w-[1.25rem] text-primary">
                     <Icon icon={Check} size="md" />
                  </div>
                  <p><span className="font-semibold block text-foreground">You hold the only key</span> We cannot see your data or reset your password.</p>
                </div>
                <div className="flex gap-3">
                   <div className="mt-0.5 min-w-[1.25rem] text-primary">
                     <Icon icon={Check} size="md" />
                  </div>
                  <p><span className="font-semibold block text-foreground">Encrypted by default</span> There is no plaintext-at-rest path.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Button 
                  variant="gradient" 
                  size="xl" 
                  fullWidth
                  onClick={() => {
                    setError(null);
                    setStep("create");
                  }}
                  className="group"
                >
                  I Understand, Create Vault
                  <Icon
                    icon={ArrowRight}
                    size="md"
                    className="ml-2 transition-transform group-hover:translate-x-1"
                  />
                </Button>

                {enableGeneratedDefault && (
                  <Button
                    variant="none"
                    effect="fade"
                    size="xl"
                    fullWidth
                    className="text-base"
                    onClick={() => void handleCreateGeneratedDefault()}
                    disabled={isUnlocking}
                  >
                    {isUnlocking ? (
                      <>
                        <Icon icon={Loader2} size="md" className="mr-2 animate-spin" />
                        Preparing secure default...
                      </>
                    ) : (
                      "Not now (use secure default key)"
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Create Passphrase */}
          {step === "create" && (
            <div className="space-y-4">
              <div className="text-center">
                <Icon icon={Lock} size={48} className="mx-auto text-primary mb-4" />
                <h3 className="font-semibold text-xl">Create Your Vault Passphrase</h3>
                <p className="text-base text-muted-foreground mt-2">
                  This passphrase encrypts your data. We never see it.
                </p>
              </div>
              <div className="space-y-3">
                <Label htmlFor="passphrase" className="text-base">Passphrase</Label>
                <Input
                  id="passphrase"
                  type="password"
                  placeholder="Enter a strong passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoFocus
                  className="h-14 text-lg px-4"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="confirm" className="text-base">Confirm Passphrase</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Re-enter passphrase"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  className="h-14 text-lg px-4"
                />
              </div>
              <Button
                variant="gradient"
                effect="glass"
                size="xl"
                fullWidth
                className="mt-4"
                onClick={handleCreatePassphrase}
                disabled={isUnlocking || passphrase.length < 8 || passphrase !== confirmPassphrase}
              >
                {isUnlocking ? (
                  <>
                    <Icon icon={Loader2} size="md" className="mr-2 animate-spin" /> Creating...
                  </>
                ) : (
                  "Create Vault"
                )}
              </Button>
            </div>
          )}

          {/* Unlock Passphrase */}
          {step === "unlock" && (
            <div className="space-y-4">
              <div className="text-center">
                <Icon
                  icon={isGeneratedVaultMode ? Fingerprint : Lock}
                  size={48}
                  className="mx-auto text-primary mb-4"
                />
                <h3 className="font-semibold text-xl">Unlock Your Vault</h3>
                <p className="text-base text-muted-foreground mt-2">
                  {isGeneratedVaultMode
                    ? "Use your device security to decrypt your vault key"
                    : "Enter your passphrase to decrypt your data"}
                </p>
              </div>
              {!isGeneratedVaultMode && (
                <div className="space-y-3">
                  <Label htmlFor="unlock-passphrase" className="text-base">Passphrase</Label>
                  <Input
                    id="unlock-passphrase"
                    type="password"
                    placeholder="Enter your passphrase"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleUnlockPassphrase()
                    }
                    autoFocus
                    className="h-14 text-lg px-4"
                  />
                </div>
              )}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <div className="flex flex-col gap-3 pt-2">
                <Button
                  variant="gradient"
                  effect="glass"
                  size="xl"
                  fullWidth
                  className="text-lg font-semibold"
                  onClick={() =>
                    isGeneratedVaultMode
                      ? void handleUnlockGeneratedDefault()
                      : void handleUnlockPassphrase()
                  }
                  disabled={isUnlocking || (!isGeneratedVaultMode && !passphrase)}
                >
                  {isUnlocking ? (
                    <>
                      <Icon icon={Loader2} size="md" className="mr-2 animate-spin" /> Unlocking...
                    </>
                  ) : (
                    generatedUnlockLabel
                  )}
                </Button>
                <Button
                  variant="none"
                  effect="glass"
                  size="xl"
                  fullWidth
                  className="text-base"
                  onClick={() => {
                    setError(null);
                    setStep("recovery");
                  }}
                  disabled={isUnlocking}
                >
                  Use Recovery Key
                </Button>
              </div>
            </div>
          )}

          {/* Recovery Key Input */}
          {step === "recovery" && !recoveryKey && (
            <div className="space-y-4">
              <div className="text-center">
                <Icon icon={Key} size={48} className="mx-auto text-primary mb-4" />
                <h3 className="font-semibold text-xl">Enter Recovery Key</h3>
                <p className="text-base text-muted-foreground mt-2">
                  Enter your recovery key to unlock your vault
                </p>
              </div>
              <div className="space-y-3">
                <Label htmlFor="recovery-key" className="text-base">Recovery Key</Label>
                <Input
                  id="recovery-key"
                  placeholder="HRK-XXXX-XXXX-XXXX-XXXX"
                  value={recoveryKeyInput}
                  onChange={(e) =>
                    setRecoveryKeyInput(e.target.value.toUpperCase())
                  }
                  className="h-14 text-lg px-4 font-mono"
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <Button
                  variant="gradient"
                  effect="glass"
                  size="xl"
                  fullWidth
                  className="text-lg font-semibold"
                  onClick={handleRecoveryKeySubmit}
                  disabled={isUnlocking || !recoveryKeyInput}
                >
                  {isUnlocking ? (
                    <>
                      <Icon icon={Loader2} size="md" className="mr-2 animate-spin" /> Unlocking...
                    </>
                  ) : (
                    "Unlock"
                  )}
                </Button>
                <Button
                  variant="none"
                  effect="glass"
                  size="xl"
                  fullWidth
                  className="text-base"
                  onClick={() => {
                    setError(null);
                    setStep("unlock");
                  }}
                  disabled={isUnlocking}
                >
                  {isGeneratedVaultMode ? generatedUnlockLabel : "Use Passphrase"}
                </Button>
              </div>
            </div>
          )}

          {/* Success */}
          {step === "success" && (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">✅</div>
              <p className="text-muted-foreground">
                Vault unlocked, redirecting...
              </p>
            </div>
          )}

          {step === "method" && (
            <div className="space-y-4">
              <div className="text-center">
                <Icon
                  icon={
                    recommendedQuickMethod === "generated_default_web_prf"
                      ? Key
                      : Fingerprint
                  }
                  size={48}
                  className="mx-auto text-primary mb-4"
                />
                <h3 className="font-semibold text-xl">Enable quicker unlock?</h3>
                <p className="text-base text-muted-foreground mt-2">
                  You can keep passphrase unlock, or enable{" "}
                  {recommendedQuickMethod === "generated_default_web_prf"
                    ? "passkey"
                    : "device biometric"}{" "}
                  and still retain recovery-key fallback.
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <Button
                  variant="gradient"
                  effect="glass"
                  size="xl"
                  fullWidth
                  disabled={isUnlocking || !pendingUnlockKey || !recommendedQuickMethod}
                  onClick={async () => {
                    if (!pendingUnlockKey || !recommendedQuickMethod) return;
                    setIsUnlocking(true);
                    try {
                      const result = await VaultMethodService.switchMethod({
                        userId: user.uid,
                        currentVaultKey: pendingUnlockKey,
                        displayName: user.displayName || user.email || "Hushh User",
                        targetMethod: recommendedQuickMethod,
                      });
                      setVaultMode(result.method);
                      const finalized = await finalizeUnlock(pendingUnlockKey);
                      if (!finalized) return;
                      toast.success(
                        result.method === "generated_default_web_prf"
                          ? "Passkey unlock enabled."
                          : "Biometric unlock enabled."
                      );
                    } catch (err: any) {
                      console.error("Quick unlock enable failed:", err);
                      toast.error(
                        err?.message || "Couldn't enable quick unlock right now."
                      );
                    } finally {
                      setIsUnlocking(false);
                    }
                  }}
                >
                  {isUnlocking ? (
                    <>
                      <Icon icon={Loader2} size="md" className="mr-2 animate-spin" />
                      Enabling...
                    </>
                  ) : (
                    `Enable ${
                      recommendedQuickMethod === "generated_default_web_prf"
                        ? "Passkey"
                        : "Biometric"
                    }`
                  )}
                </Button>

                <Button
                  variant="none"
                  effect="fade"
                  size="xl"
                  fullWidth
                  disabled={isUnlocking || !pendingUnlockKey}
                  onClick={async () => {
                    if (!pendingUnlockKey) return;
                    await finalizeUnlock(pendingUnlockKey);
                  }}
                >
                  Not now, continue with passphrase
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recovery Key Dialog (New User) */}
      <Dialog
        open={step === "recovery" && !!recoveryKey}
        onOpenChange={() => {}}
      >
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Icon icon={Key} size="lg" className="text-orange-500" />
              <DialogTitle>Save Your Recovery Key</DialogTitle>
            </div>
            <DialogDescription>
              This is the ONLY way to recover your vault if you forget your
              vault credentials. Store it somewhere safe!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert className="bg-orange-500/10 border-orange-500/50">
              <Icon icon={AlertCircle} size="sm" className="text-orange-500" />
              <AlertDescription className="text-orange-700 dark:text-orange-300">
                Write this down or save it securely. You cannot recover it
                later!
              </AlertDescription>
            </Alert>

            <div className="p-4 bg-muted rounded-lg border-2 border-dashed">
              <code className="text-lg font-mono font-bold tracking-wide">
                {recoveryKey}
              </code>
            </div>

            <div className="flex gap-2">
              <Button
                variant="none"
                className="flex-1 border border-gray-200 dark:border-gray-700"
                onClick={handleCopyRecoveryKey}
              >
                {copied ? (
                  <>
                    <Icon icon={Check} size="sm" className="mr-2 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Icon icon={Copy} size="sm" className="mr-2" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                variant="none"
                className="flex-1 border border-gray-200 dark:border-gray-700"
                onClick={async () => {
                  const content = `Hushh Recovery Key\n\n${recoveryKey}\n\nStore this file securely. This is the ONLY way to recover your vault if you lose your vault credentials.`;
                  await downloadTextFile(content, "hushh-recovery-key.txt");
                }}
              >
                <Icon icon={Download} size="sm" className="mr-2" />
                Download
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="gradient"
              effect="glass"
              className="w-full"
              onClick={handleRecoveryKeyContinue}
            >
              I've Saved My Recovery Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
