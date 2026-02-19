"use client";

import { Capacitor } from "@capacitor/core";

import type { GeneratedVaultKeyMode } from "@/lib/services/vault-bootstrap-service";
import { VaultBootstrapService } from "@/lib/services/vault-bootstrap-service";
import { VaultService } from "@/lib/services/vault-service";
import { rewrapVaultKeyWithPassphrase } from "@/lib/vault/rewrap-vault-key";

export type VaultMethod = "passphrase" | GeneratedVaultKeyMode;

export type VaultCapabilityMatrix = {
  passphrase: boolean;
  generatedNativeBiometric: boolean;
  generatedWebPrf: boolean;
  recommendedMethod: VaultMethod;
  reason?: string;
};

function normalizeMethod(input: {
  keyMode?: string | null;
  authMethod?: string | null;
}): VaultMethod {
  const value = input.keyMode ?? input.authMethod ?? "passphrase";
  if (
    value === "generated_default_native_biometric" ||
    value === "generated_default_web_prf"
  ) {
    return value;
  }
  return "passphrase";
}

export class VaultMethodService {
  static async getCurrentMethod(userId: string): Promise<VaultMethod> {
    const vault = await VaultService.getVault(userId);
    return normalizeMethod(vault);
  }

  static async getCapabilityMatrix(): Promise<VaultCapabilityMatrix> {
    const support = await VaultService.canUseGeneratedDefaultVault();

    if (support.supported) {
      if (support.mode === "generated_default_native_biometric") {
        return {
          passphrase: true,
          generatedNativeBiometric: true,
          generatedWebPrf: false,
          recommendedMethod: "generated_default_native_biometric",
        };
      }

      return {
        passphrase: true,
        generatedNativeBiometric: false,
        generatedWebPrf: true,
        recommendedMethod: "generated_default_web_prf",
      };
    }

    return {
      passphrase: true,
      generatedNativeBiometric: false,
      generatedWebPrf: false,
      recommendedMethod: "passphrase",
      reason: support.reason,
    };
  }

  static async switchMethod(params: {
    userId: string;
    currentVaultKey: string;
    displayName: string;
    targetMethod: VaultMethod;
    passphrase?: string;
  }): Promise<{ method: VaultMethod }> {
    const existing = await VaultService.getVault(params.userId);
    const currentMethod = normalizeMethod(existing);

    if (currentMethod === params.targetMethod) {
      return { method: currentMethod };
    }

    if (params.targetMethod === "passphrase") {
      const passphrase = params.passphrase?.trim();
      if (!passphrase || passphrase.length < 8) {
        throw new Error("Passphrase must be at least 8 characters.");
      }

      const wrapped = await rewrapVaultKeyWithPassphrase({
        vaultKeyHex: params.currentVaultKey,
        wrappingSecret: passphrase,
      });

      await VaultService.setupVault(params.userId, {
        authMethod: "passphrase",
        keyMode: "passphrase",
        encryptedVaultKey: wrapped.encryptedVaultKey,
        salt: wrapped.salt,
        iv: wrapped.iv,
        recoveryEncryptedVaultKey: existing.recoveryEncryptedVaultKey,
        recoverySalt: existing.recoverySalt,
        recoveryIv: existing.recoveryIv,
      });

      await VaultBootstrapService.clearGeneratedDefaultMaterial(
        params.userId,
        currentMethod === "passphrase" ? null : currentMethod
      );

      VaultService.setVaultCheckCache(params.userId, true);
      return { method: "passphrase" };
    }

    const material = await VaultBootstrapService.provisionGeneratedMethodMaterial({
      userId: params.userId,
      displayName: params.displayName,
    });

    if (material.mode !== params.targetMethod) {
      throw new Error("Requested method is not supported on this device.");
    }

    try {
      const wrapped = await rewrapVaultKeyWithPassphrase({
        vaultKeyHex: params.currentVaultKey,
        wrappingSecret: material.wrappingSecret,
      });

      await VaultService.setupVault(params.userId, {
        authMethod: material.authMethod,
        keyMode: material.mode,
        encryptedVaultKey: wrapped.encryptedVaultKey,
        salt: wrapped.salt,
        iv: wrapped.iv,
        recoveryEncryptedVaultKey: existing.recoveryEncryptedVaultKey,
        recoverySalt: existing.recoverySalt,
        recoveryIv: existing.recoveryIv,
        passkeyCredentialId: material.passkeyCredentialId,
        passkeyPrfSalt: material.passkeyPrfSalt,
      });

      if (
        currentMethod !== "passphrase" &&
        currentMethod !== material.mode &&
        currentMethod === "generated_default_native_biometric"
      ) {
        await VaultBootstrapService.clearGeneratedDefaultMaterial(params.userId, currentMethod);
      }

      VaultService.setVaultCheckCache(params.userId, true);
      return { method: material.mode };
    } catch (error) {
      if (material.mode === "generated_default_native_biometric" && Capacitor.isNativePlatform()) {
        await VaultBootstrapService.clearGeneratedDefaultMaterial(params.userId, material.mode);
      }
      throw error;
    }
  }
}
