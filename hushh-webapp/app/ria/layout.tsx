"use client";

import { VaultLockGuard } from "@/components/vault/vault-lock-guard";

export default function RiaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <VaultLockGuard>{children}</VaultLockGuard>;
}
