"use client";

import { useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Building2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  WalletCards,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  SettingsDetailPanel,
  SettingsGroup,
  SettingsRow,
} from "@/components/profile/settings-ui";
import { Button } from "@/lib/morphy-ux/button";
import type {
  PlaidAccountSummary,
  PlaidItemSummary,
} from "@/lib/kai/brokerage/portfolio-sources";
import { cn } from "@/lib/utils";

function formatCurrency(value: number | null | undefined, currency = "USD"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Value unavailable";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRelativeTimestamp(value: string | null | undefined): string {
  if (!value) return "Not synced yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not synced yet";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function accountSubtypeLabel(account: PlaidAccountSummary): string {
  const subtype = String(account.subtype || "").trim();
  const type = String(account.type || "").trim();
  return subtype || type || "Investment";
}

function accountCurrentValue(account: PlaidAccountSummary): number | null {
  const balances =
    account.balances && typeof account.balances === "object" ? account.balances : null;
  const current = balances?.current;
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function connectionHealth(item: PlaidItemSummary): {
  label: string;
  toneClassName: string;
  description: string;
  requiresAttention: boolean;
  isRefreshing: boolean;
} {
  const runStatus = String(item.latest_refresh_run?.status || "").trim();
  const syncStatus = String(item.sync_status || "").trim();
  const itemStatus = String(item.status || "").trim();

  if (runStatus === "queued" || runStatus === "running" || syncStatus === "running") {
    return {
      label: "Refreshing",
      toneClassName:
        "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 dark:border-sky-400/30 dark:bg-sky-400/10",
      description: "Brokerage refresh in progress.",
      requiresAttention: false,
      isRefreshing: true,
    };
  }
  if (itemStatus === "permission_revoked") {
    return {
      label: "Permission revoked",
      toneClassName:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:border-amber-400/30 dark:bg-amber-400/10",
      description: "Broker access was revoked and needs to be reconnected.",
      requiresAttention: true,
      isRefreshing: false,
    };
  }
  if (itemStatus === "relink_required" || syncStatus === "action_required") {
    return {
      label: "Relink required",
      toneClassName:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:border-amber-400/30 dark:bg-amber-400/10",
      description: "This connection needs your attention before it can refresh again.",
      requiresAttention: true,
      isRefreshing: false,
    };
  }
  if (itemStatus === "error" || syncStatus === "failed") {
    return {
      label: "Needs attention",
      toneClassName:
        "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 dark:border-rose-400/30 dark:bg-rose-400/10",
      description: "Kai could not sync this brokerage recently.",
      requiresAttention: true,
      isRefreshing: false,
    };
  }
  if (syncStatus === "stale") {
    return {
      label: "Stale",
      toneClassName:
        "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300 dark:border-orange-400/30 dark:bg-orange-400/10",
      description: "Brokerage data is available, but freshness is aging.",
      requiresAttention: false,
      isRefreshing: false,
    };
  }
  return {
    label: "Active",
    toneClassName:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:border-emerald-400/30 dark:bg-emerald-400/10",
    description: "Brokerage data is connected and ready.",
    requiresAttention: false,
    isRefreshing: false,
  };
}

function flattenPlaidAccounts(items: PlaidItemSummary[]): Array<PlaidAccountSummary & {
  connectionStatusLabel: string;
}> {
  return items.flatMap((item) =>
    (item.accounts || []).map((account) => ({
      ...account,
      institution_name: account.institution_name || item.institution_name || null,
      connectionStatusLabel: connectionHealth(item).label,
    }))
  );
}

function PlaidStatusBadge({ item }: { item: PlaidItemSummary }) {
  const health = connectionHealth(item);
  return (
    <span className="inline-flex items-center gap-1.5">
      {health.isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" /> : null}
      <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 text-[11px]", health.toneClassName)}>
        {health.label}
      </Badge>
    </span>
  );
}

interface PlaidBrokerageSummarySectionProps {
  items: PlaidItemSummary[];
  onRefreshItem?: (itemId?: string) => Promise<void> | void;
  onCancelRefresh?: (params?: { itemId?: string; runIds?: string[] }) => Promise<void> | void;
  onManageConnection?: (itemId?: string) => Promise<void> | void;
  onViewInvestments?: () => void;
  className?: string;
}

export function PlaidBrokerageSummarySection({
  items,
  onRefreshItem,
  onCancelRefresh,
  onManageConnection,
  onViewInvestments,
  className,
}: PlaidBrokerageSummarySectionProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.item_id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  if (!items.length) return null;

  return (
    <>
      <SettingsGroup
        className={className}
        eyebrow="Connected brokerages"
        title="Plaid-linked investment accounts"
        description="Read-only brokerages stay broker-sourced here, while statements remain your editable source."
      >
        {items.map((item) => {
          const health = connectionHealth(item);
          const accountsCount = item.accounts?.length || 0;
          const totalValue = Number(item.summary?.total_value || item.portfolio_data?.total_value || 0);
          return (
            <SettingsRow
              key={item.item_id}
              icon={Building2}
              title={item.institution_name || item.institution_id || "Connected brokerage"}
              description={`${accountsCount} account${accountsCount === 1 ? "" : "s"} • ${health.description} • Last sync ${formatRelativeTimestamp(item.last_synced_at)}`}
              trailing={
                <div className="flex items-center gap-2">
                  <div className="hidden text-right sm:block">
                    <p className="text-[13px] font-semibold text-foreground">
                      {formatCurrency(Number.isFinite(totalValue) ? totalValue : null)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Current value</p>
                  </div>
                  <PlaidStatusBadge item={item} />
                </div>
              }
              chevron
              onClick={() => setSelectedItemId(item.item_id)}
            />
          );
        })}
      </SettingsGroup>

      <SettingsDetailPanel
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) setSelectedItemId(null);
        }}
        title={selectedItem?.institution_name || "Connected brokerage"}
        description={
          selectedItem
            ? `${selectedItem.accounts?.length || 0} account${(selectedItem.accounts?.length || 0) === 1 ? "" : "s"} • Last sync ${formatRelativeTimestamp(selectedItem.last_synced_at)}`
            : undefined
        }
      >
        {selectedItem ? (
          <div className="space-y-4">
            {(selectedItem.last_error_message || connectionHealth(selectedItem).requiresAttention) ? (
              <div className="rounded-[20px] border border-amber-500/20 bg-amber-500/8 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {connectionHealth(selectedItem).label}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {selectedItem.last_error_message || connectionHealth(selectedItem).description}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {connectionHealth(selectedItem).isRefreshing ? (
                <Button
                  variant="none"
                  effect="fade"
                  onClick={() =>
                    void onCancelRefresh?.({
                      itemId: selectedItem.item_id,
                      runIds: selectedItem.latest_refresh_run?.run_id
                        ? [selectedItem.latest_refresh_run.run_id]
                        : [],
                    })
                  }
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel refresh
                </Button>
              ) : (
                <Button
                  variant="none"
                  effect="fade"
                  onClick={() => void onRefreshItem?.(selectedItem.item_id)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              )}
              <Button
                variant="none"
                effect="fade"
                onClick={() => void onManageConnection?.(selectedItem.item_id)}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Manage connection
              </Button>
              {onViewInvestments ? (
                <Button variant="none" effect="fade" onClick={onViewInvestments}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View investments
                </Button>
              ) : null}
            </div>

            <SettingsGroup
              eyebrow="Accounts"
              title="Investment accounts"
              description="Each linked account stays read-only and keeps its brokerage metadata."
            >
              {(selectedItem.accounts || []).map((account) => {
                const currencyCode = String(account.balances?.iso_currency_code || "USD");
                return (
                  <SettingsRow
                    key={account.account_id}
                    icon={WalletCards}
                    title={account.name || account.official_name || "Investment account"}
                    description={[
                      accountSubtypeLabel(account),
                      account.mask ? `•••• ${account.mask}` : null,
                      selectedItem.institution_name || null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                    trailing={
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                          {accountSubtypeLabel(account)}
                        </Badge>
                        <div className="text-right">
                          <p className="text-[13px] font-semibold text-foreground">
                            {formatCurrency(accountCurrentValue(account), currencyCode)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Current balance</p>
                        </div>
                      </div>
                    }
                  />
                );
              })}
            </SettingsGroup>
          </div>
        ) : null}
      </SettingsDetailPanel>
    </>
  );
}

export function PlaidInvestmentAccountsSection({
  items,
  className,
}: {
  items: PlaidItemSummary[];
  className?: string;
}) {
  const accounts = useMemo(() => flattenPlaidAccounts(items), [items]);
  if (!accounts.length) return null;

  return (
    <SettingsGroup
      className={className}
      eyebrow="Investment accounts"
      title="Accounts connected through Plaid"
      description="Account subtype, masked identifiers, institution, and current balance stay visible even when holdings are sparse."
    >
      {accounts.map((account) => {
        const currencyCode = String(account.balances?.iso_currency_code || "USD");
        return (
          <SettingsRow
            key={`${account.item_id}:${account.account_id}`}
            icon={BadgeDollarSign}
            title={account.name || account.official_name || "Investment account"}
            description={[
              account.institution_name || null,
              accountSubtypeLabel(account),
              account.mask ? `•••• ${account.mask}` : null,
              account.connectionStatusLabel,
            ]
              .filter(Boolean)
              .join(" • ")}
            trailing={
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                  {accountSubtypeLabel(account)}
                </Badge>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-foreground">
                    {formatCurrency(accountCurrentValue(account), currencyCode)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Current balance</p>
                </div>
              </div>
            }
          />
        );
      })}
    </SettingsGroup>
  );
}
