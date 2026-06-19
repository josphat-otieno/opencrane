/**
 * The tenant's allowed model set as resolved by the control-plane, returned by
 * `GET /api/internal/tenant-models/:tenant`.
 *
 * Used to restrict both the tenant's LiteLLM virtual key and the OpenClaw config
 * to the models the tenant is actually registered for. A `null` result (any
 * fetch failure, non-200, or missing control-plane URL) signals callers to fall
 * back to today's unrestricted behaviour — the fetch is deliberately best-effort.
 */
export interface TenantModelSet
{
  /** Model identifiers the tenant is allowed to use; may be empty. */
  models: string[];

  /** Preferred default model for the tenant, or `null` when none is registered. */
  defaultModel: string | null;
}
