import type { TenantModelFetchStatus } from "../internal/tenant-models.types.js";
import { TenantDegradedReason } from "../models/tenant-status.interface.js";
import type { TenantModelGateDecision } from "./model-gate.types.js";

/**
 * Decide whether it is SAFE to re-render the tenant's openclaw ConfigMap from the
 * just-fetched model set — the fail-safe at the heart of issue #144.
 *
 * The render is fail-UNSAFE by itself: when LiteLLM is enabled the litellm-proxy provider
 * runs in `replace` mode, so an empty/unknown model set renders `models: []` with no
 * `agents.defaults.model`, and openclaw then falls back to the bare built-in `openai`
 * provider and fails every turn with `missing-provider-auth`. A transient empty/failed
 * `tenant-models` read at reconcile would therefore overwrite a previously-good config.
 *
 * This gate refuses that overwrite:
 *  - LiteLLM disabled ⇒ there is no `models` block to render badly, so always `render`.
 *  - Fetch `ok` (non-empty) ⇒ `render` — the normal path.
 *  - Fetch `empty`/`error` with NO existing ConfigMap ⇒ `render`. This is a first-ever
 *    provision (onboarding-incomplete); there is nothing good to protect and skipping
 *    would wedge provisioning forever. The rendered config is model-less but that state
 *    self-heals on the next successful fetch (onboarding requires ≥1 model before use).
 *  - Fetch `empty`/`error` WITH an existing ConfigMap ⇒ `skip-degraded`. A working config
 *    is already applied; keep it, do not clobber, and surface the reason on the CR.
 *
 * @param fetchStatus - Outcome of the `tenant-models` fetch (`ok` | `empty` | `error`).
 * @param liteLlmEnabled - Whether the operator renders the `replace`-mode LiteLLM provider.
 * @param hasExistingConfigMap - Whether a prior openclaw ConfigMap is already applied.
 */
export function _ResolveTenantModelGate(
  fetchStatus: TenantModelFetchStatus,
  liteLlmEnabled: boolean,
  hasExistingConfigMap: boolean,
): TenantModelGateDecision
{
  // Without the replace-mode LiteLLM provider there is no model-less failure mode to
  // guard: the config carries no `models` block, so a re-render is always safe.
  if (!liteLlmEnabled || fetchStatus === "ok")
  {
    return { action: "render" };
  }

  // First-ever provision — nothing good exists to protect, and skipping would deadlock
  // the tenant. Render the (temporarily model-less) config; it self-heals on next fetch.
  if (!hasExistingConfigMap)
  {
    return { action: "render" };
  }

  // A good ConfigMap is already applied and the fresh read is empty/unknown: keep the
  // last-applied config and mark the tenant Degraded rather than clobbering it.
  return fetchStatus === "empty"
    ? {
        action: "skip-degraded",
        reason: TenantDegradedReason.ModelSetEmpty,
        message: "tenant-models returned an empty set; kept the last-applied openclaw config (tenant has no registered models — complete onboarding to restore model refresh)",
      }
    : {
        action: "skip-degraded",
        reason: TenantDegradedReason.ModelFetchFailed,
        message: "tenant-models fetch failed; kept the last-applied openclaw config to avoid rendering a model-less config",
      };
}
