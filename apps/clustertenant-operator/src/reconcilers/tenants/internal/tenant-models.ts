import type { Logger } from "pino";

import type { TenantModelFetch } from "./tenant-models.types.js";

/** Maximum time (ms) to wait on the control-plane before giving up and falling back. */
const _FETCH_TIMEOUT_MS = 2000;

/**
 * Fetch the tenant's allowed model set from the control-plane internal API.
 *
 * This is a deliberate, best-effort operator → control-plane dependency: it MUST never
 * break tenant reconcile. Every failure — missing URL, network error, timeout, non-200,
 * or malformed body — resolves to `{ status: "error" }` (logged at warn); a genuine
 * no-models tenant resolves to `{ status: "empty" }` (logged at info). Neither throws.
 * The caller decides what to do with each (see `_ResolveTenantModelGate`).
 *
 * @param controlPlaneUrl - In-cluster control-plane base URL (no trailing slash needed).
 * @param tenant - Tenant CR name to resolve the model set for.
 * @param log - Scoped logger for the (non-fatal) diagnostics.
 * @returns A {@link TenantModelFetch} whose `status` distinguishes ok / empty / error.
 */
export async function _FetchTenantModels(controlPlaneUrl: string, tenant: string, log: Logger): Promise<TenantModelFetch>
{
  // 1. Missing config — without a control-plane URL there is nothing to call. This is a
  //    known-degraded posture (the reconcile cannot learn the model set), so treat it as
  //    `error` — "unknown", not "genuinely empty" — but log at debug to avoid per-reconcile noise.
  if (!controlPlaneUrl || controlPlaneUrl.trim().length === 0)
  {
    log.debug({ tenant }, "control-plane URL unset; cannot resolve tenant-models");
    return { status: "error", modelSet: null };
  }

  // 2. Bounded request — abort after a short timeout so a hung control-plane never
  //    stalls the reconcile loop.
  const controller = new AbortController();
  const timer = setTimeout(function _abort(): void { controller.abort(); }, _FETCH_TIMEOUT_MS);

  try
  {
    const url = `${controlPlaneUrl}/api/internal/tenant-models/${encodeURIComponent(tenant)}`;
    const response = await fetch(url, { signal: controller.signal });

    // 3. Non-200 — the endpoint is reachable but did not return a model set (404 for
    //    unknown tenant, 5xx, etc.); the real model set is unknown, so this is `error`.
    if (!response.ok)
    {
      log.warn({ tenant, status: response.status }, "tenant-models fetch returned non-200; model set unknown");
      return { status: "error", modelSet: null };
    }

    // 4. Parse — a body whose `models` is not even an array is malformed, so the real
    //    model set is unknown → `error` (not the onboarding-incomplete `empty`).
    const payload = await response.json() as { models?: unknown; defaultModel?: unknown };
    if (!Array.isArray(payload.models))
    {
      log.warn({ tenant }, "tenant-models returned a malformed body; model set unknown");
      return { status: "error", modelSet: null };
    }
    const models = payload.models.filter(function _isString(value: unknown): value is string { return typeof value === "string"; });
    const defaultModel = typeof payload.defaultModel === "string" ? payload.defaultModel : null;

    // 5. Empty result — a well-formed 200 that lists no models. The tenant genuinely has
    //    none (onboarding-incomplete), which is NOT a fetch failure but still must not
    //    clobber a previously-good config.
    if (models.length === 0)
    {
      log.info({ tenant }, "tenant-models returned an empty set; tenant has no registered models");
      return { status: "empty", modelSet: { models, defaultModel } };
    }

    return { status: "ok", modelSet: { models, defaultModel } };
  }
  catch (err)
  {
    log.warn({ tenant, err }, "tenant-models fetch failed; model set unknown");
    return { status: "error", modelSet: null };
  }
  finally
  {
    clearTimeout(timer);
  }
}
