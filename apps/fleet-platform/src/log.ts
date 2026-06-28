import { ___CreateLogger } from "@opencrane/observability";
import type { Logger } from "@opencrane/observability";

/**
 * Process-wide fleet-manager logger.
 *
 * A single root logger shared by the bootstrap (`index.ts`), the reconcile loops, and the HTTP
 * API so every line is consistent and — thanks to the AsyncLocalStorage mixin in
 * `@opencrane/observability` — automatically carries the active request's `requestId` and the
 * current span's `trace_id`.
 */
export const _log: Logger = ___CreateLogger("fleet-manager");
