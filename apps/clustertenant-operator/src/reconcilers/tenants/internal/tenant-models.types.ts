import type { TenantModelSet } from "@opencrane/contracts";

/**
 * Outcome of a `tenant-models` fetch, kept distinct from the model set itself so the
 * caller can tell three cases apart — a distinction the config-map gate needs to
 * decide whether it is SAFE to re-render (see `_ResolveTenantModelGate`):
 *
 *  - `ok`    — the endpoint returned a non-empty model set. Safe to render.
 *  - `empty` — the endpoint returned 200 with `[]`: the tenant genuinely has NO
 *              registered models (onboarding-incomplete). Not an error, but rendering
 *              a LiteLLM config from it would emit `models: []` + no default.
 *  - `error` — transport failure, timeout, non-200, or a malformed body. The upstream
 *              read is untrustworthy; the tenant's real model set is UNKNOWN.
 *
 * `empty` and `error` are surfaced separately (logged/conditioned differently) but the
 * gate treats BOTH as "do not clobber a working config".
 */
export type TenantModelFetchStatus = "ok" | "empty" | "error";

/** Discriminated result of `_FetchTenantModels`. */
export interface TenantModelFetch
{
  status: TenantModelFetchStatus;
  /** The parsed model set; `null` on `error` and on a missing control-plane URL. */
  modelSet: TenantModelSet | null;
}
