/**
 * Types for the tenant rollout canary update controller.
 * Tracks canary rollout state per operator session and exposes it for logging.
 */

/** Canary rollout phase for a tenant rollout session. */
export type TenantRolloutPhase = "idle" | "canary" | "rolling" | "rolled-back" | "complete";

/** Per-tenant canary update record tracked in memory during a rollout. */
export interface TenantRolloutEntry
{
  /** Tenant name. */
  tenantName: string;

  /** Target OpenClaw version being rolled out. */
  targetVersion: string;

  /** Previous OpenClaw version (for rollback). */
  previousVersion: string;

  /** When the canary pod was scheduled. */
  startedAt: string;

  /** Whether the canary pod passed readiness within the timeout. */
  success: boolean | null;

  /** Failure reason when success is false. */
  failureReason?: string;
}

/** Tenant rollout configuration resolved from operator config and environment. */
export interface TenantRolloutConfig
{
  /** How long to wait for a canary pod to become Ready before rolling back (ms). */
  canaryTimeoutMs: number;

  /** Whether automatic version updates from the release channel are enabled. */
  autoUpdateEnabled: boolean;

  /** npm package tag to follow for automatic updates (e.g. "latest"). */
  releaseTag: string;
}
