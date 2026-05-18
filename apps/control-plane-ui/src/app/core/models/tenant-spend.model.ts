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
  /** Monthly budget ceiling in USD. */
  budgetUsd: number;
  /** Remaining budget (budgetUsd - spentUsd). */
  remainingUsd: number;
  /** Budget alert state ("ok" | "warning" | "exceeded"). */
  budgetAlertState: TenantSpendAlertState;
  /** ISO-8601 timestamp of the spend report. */
  reportedAt: string;
}
