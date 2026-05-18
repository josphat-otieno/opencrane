import type { TenantPhase } from "./tenant-phase.enum";

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
  phase: TenantPhase | string;
  /** Ingress hostname when provisioned. */
  ingressHost?: string;
  /** ISO-8601 creation timestamp. */
  createdAt?: string;
}
