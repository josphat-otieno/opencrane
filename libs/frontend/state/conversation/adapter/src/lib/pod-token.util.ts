import { ConnectionStatus } from "@opencrane/state/core";

/**
 * Pure helper for classifying a failed `POST /auth/pod-token` response, factored
 * out of the gateway so the (status, code) → {@link ConnectionStatus} rule can be
 * unit-tested without Angular DI.
 */

/**
 * Map a non-OK pod-token broker response onto a {@link ConnectionStatus}.
 *
 * Keys off the machine-readable `code` first, because the backend reuses HTTP 409
 * for two very different outcomes:
 *   - `POD_NOT_READY` → the tenant resolved but its pod is still being provisioned:
 *     a *transient* {@link ConnectionStatus.Provisioning} the user can retry.
 *   - `NO_TENANT` / `AMBIGUOUS_TENANT` (and any 403) → no/ambiguous workspace for
 *     the session email: a terminal {@link ConnectionStatus.Refused}.
 * Any other failure (429 rate-limit, 5xx) is a transient transport problem and
 * backs off as {@link ConnectionStatus.Closed}. 401 never reaches here — the
 * api-client middleware redirects to login first.
 *
 * @param httpStatus - The broker response's HTTP status.
 * @param code       - The `code` field from the error body, if present.
 * @returns The connection status the gateway should adopt.
 */
export function _PodTokenFailureStatus(httpStatus: number, code: string | undefined): ConnectionStatus
{
	if (code === "POD_NOT_READY")
	{
		return ConnectionStatus.Provisioning;
	}
	if (httpStatus === 403 || httpStatus === 409)
	{
		return ConnectionStatus.Refused;
	}
	return ConnectionStatus.Closed;
}
