/** Budget alert states for tenant spend views. */
export enum TenantSpendAlertState
{
  Ok = "ok",
  Warning = "warning",
  Exceeded = "exceeded",
}

/** Tenant spend summary returned by the budget endpoint. */
export interface TenantSpend
{
  /** Tenant name. */
  tenantName: string;
  /** Spend in USD so far this month. */
  spentUsd: number;
  /** Optional spend in EUR for regions using EUR billing views. */
  spentEur?: number;
  /** Monthly budget ceiling in USD. */
  budgetUsd: number;
  /** Optional monthly budget ceiling in EUR for regions using EUR billing views. */
  budgetEur?: number;
  /** Remaining budget (budgetUsd - spentUsd). */
  remainingUsd: number;
  /** Optional remaining budget in EUR. */
  remainingEur?: number;
  /** Budget alert state ("ok" | "warning" | "exceeded"). */
  budgetAlertState: TenantSpendAlertState | string;
  /** ISO-8601 timestamp of the spend report. */
  reportedAt: string;
}
