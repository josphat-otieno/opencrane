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
