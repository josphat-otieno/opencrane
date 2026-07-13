import type { TenantDegradedReason } from "../models/tenant-status.interface.js";

/**
 * The two ways a reconcile can treat the tenant ConfigMap once the model set is known.
 *
 *  - `render`        — safe to (re-)render and apply the ConfigMap from live state.
 *  - `skip-degraded` — the model set is empty/unknown AND a good ConfigMap already
 *                      exists; keep the last-applied one and mark the tenant Degraded.
 */
export type TenantModelGateDecision =
  | { action: "render" }
  | { action: "skip-degraded"; reason: TenantDegradedReason; message: string };
