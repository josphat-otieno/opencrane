import type { Logger } from "pino";

import type { TenantModelSet } from "./tenant-models.types.js";

/** Maximum time (ms) to wait on the control-plane before giving up and falling back. */
const _FETCH_TIMEOUT_MS = 2000;

/**
 * Fetch the tenant's allowed model set from the control-plane internal API.
 *
 * This introduces a deliberate, best-effort operator → control-plane dependency:
 * it MUST never break tenant reconcile. Any failure — missing URL, network error,
 * timeout, non-200, or malformed body — resolves to `null` (logged at warn) so the
 * caller falls back to today's unrestricted behaviour. Mirrors the resilience
 * posture of the LiteLLM key helper, where backend issues degrade rather than crash.
 *
 * @param controlPlaneUrl - In-cluster control-plane base URL (no trailing slash needed).
 * @param tenant - Tenant CR name to resolve the model set for.
 * @param log - Scoped logger for the (non-fatal) warning on failure.
 * @returns The resolved {@link TenantModelSet}, or `null` on any error / missing URL.
 */
export async function _FetchTenantModels(controlPlaneUrl: string, tenant: string, log: Logger): Promise<TenantModelSet | null>
{
  // 1. Missing config — without a control-plane URL there is nothing to call, so
  //    fall back silently-ish (debug) rather than warning on every reconcile.
  if (!controlPlaneUrl || controlPlaneUrl.trim().length === 0)
  {
    log.debug({ tenant }, "control-plane URL unset; skipping tenant-models fetch");
    return null;
  }

  // 2. Bounded request — abort after a short timeout so a hung control-plane never
  //    stalls the reconcile loop; the fallback path is always acceptable.
  const controller = new AbortController();
  const timer = setTimeout(function _abort(): void { controller.abort(); }, _FETCH_TIMEOUT_MS);

  try
  {
    const url = `${controlPlaneUrl}/api/internal/tenant-models/${encodeURIComponent(tenant)}`;
    const response = await fetch(url, { signal: controller.signal });

    // 3. Non-200 — the endpoint is reachable but did not return a model set (404 for
    //    unknown tenant, 5xx, etc.); treat as a fallback signal, not a failure.
    if (!response.ok)
    {
      log.warn({ tenant, status: response.status }, "tenant-models fetch returned non-200; falling back to unrestricted models");
      return null;
    }

    // 4. Parse + normalise — defend against a malformed body by coercing to the
    //    expected shape; anything unexpected falls back rather than throwing upstream.
    const payload = await response.json() as { models?: unknown; defaultModel?: unknown };
    const models = Array.isArray(payload.models)
      ? payload.models.filter(function _isString(value: unknown): value is string { return typeof value === "string"; })
      : [];
    const defaultModel = typeof payload.defaultModel === "string" ? payload.defaultModel : null;

    return { models, defaultModel };
  }
  catch (err)
  {
    log.warn({ tenant, err }, "tenant-models fetch failed; falling back to unrestricted models");
    return null;
  }
  finally
  {
    clearTimeout(timer);
  }
}
