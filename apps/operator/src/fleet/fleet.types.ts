/**
 * Types for the fleet canary update controller.
 * Tracks canary state per operator session and exposes it for logging.
 */

/** Canary rollout phase for a fleet update. */
export type CanaryPhase = "idle" | "canary" | "rolling" | "rolled-back" | "complete";

/** Per-tenant canary update record tracked in memory during a rollout. */
export interface CanaryRolloutEntry
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

/** Fleet update configuration resolved from operator config and environment. */
export interface FleetUpdateConfig
{
  /** How long to wait for a canary pod to become Ready before rolling back (ms). */
  canaryTimeoutMs: number;

  /** Whether automatic version updates from the release channel are enabled. */
  autoUpdateEnabled: boolean;

  /** npm package tag to follow for automatic updates (e.g. "latest"). */
  releaseTag: string;
}
