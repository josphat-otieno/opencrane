/**
 * Shared tenant data models for the control-plane UI.
 */

/** Tenant summary returned by the list endpoint. */
export interface TenantSummary
{
  /** Unique tenant identifier. */
  name: string;
  /** Human-readable display name. */
  displayName: string;
  /** Contact email. */
  email: string;
  /** Optional team name. */
  team?: string;
  /** Lifecycle phase (e.g. "Running", "Pending", "Suspended", "Error"). */
  phase: string;
  /** Ingress hostname when provisioned. */
  ingressHost?: string;
  /** ISO-8601 creation timestamp. */
  createdAt?: string;
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
  budgetAlertState: "ok" | "warning" | "exceeded";
  /** ISO-8601 timestamp of the spend report. */
  reportedAt: string;
}

/** Request payload for creating a new tenant. */
export interface CreateTenantPayload
{
  /** Unique tenant identifier (URL-safe slug). */
  name: string;
  /** Human-readable display name. */
  displayName: string;
  /** Contact email for the tenant owner. */
  email: string;
  /** Optional team name. */
  team?: string;
  /** Optional monthly budget in USD. */
  monthlyBudgetUsd?: number;
  /** Optional AccessPolicy name to bind. */
  policyRef?: string;
}
