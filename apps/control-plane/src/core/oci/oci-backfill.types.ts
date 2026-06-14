/**
 * Outcome of a single bundle's OCI backfill attempt.
 *
 * - `pushed`  — content uploaded to the registry (idempotent; a re-push counts here).
 * - `skipped` — the bundle had no DB `content` to push (nothing to do).
 * - `failed`  — the push errored, or the recorded digest does not match the
 *   content hash (delivery looks up the recorded digest, so an orphan blob is useless).
 */
export type OciBackfillOutcome = "pushed" | "skipped" | "failed";

/** Per-bundle result of an OCI backfill run. */
export interface OciBackfillItemResult
{
  /** Skill bundle identifier. */
  id: string;

  /** Bundle name, for human-readable reporting. */
  name: string;

  /** Content-addressable digest recorded on the bundle (delivery's lookup key). */
  digest: string;

  /** What happened to this bundle. */
  outcome: OciBackfillOutcome;

  /** Failure detail when `outcome` is `failed`; absent otherwise. */
  reason?: string;
}

/** Aggregate summary returned by an OCI backfill run. */
export interface OciBackfillSummary
{
  /** Total published bundles considered. */
  total: number;

  /** Count successfully pushed to the registry (includes idempotent re-pushes). */
  pushed: number;

  /** Count skipped because they had no DB content to push. */
  skipped: number;

  /** Count that failed to push or whose content did not match the recorded digest. */
  failed: number;

  /** Per-bundle results, in the order the bundles were processed. */
  results: OciBackfillItemResult[];
}
