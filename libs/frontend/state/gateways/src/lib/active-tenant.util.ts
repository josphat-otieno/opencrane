import type { GatewayMode } from "./gateway-mode.types";

/**
 * Demo pod name used when mock/offline dev resolves no live tenant.
 *
 * In mock mode there is no control plane to resolve the caller's pod from, so
 * the resolver falls back to this fixture name; the mock gateways seed any
 * tenant name, so fixture-backed UI still renders. Live mode is always driven by
 * the real `SessionStore.currentTenant` instead.
 *
 * Internal to this lib — not exported from the package barrel, so features and
 * elements cannot depend on the fixture name.
 */
export const _MOCK_DEMO_TENANT = "alex.oc";

/**
 * Resolve the tenant a data fetch should target, across mock and live modes.
 *
 * - A resolved live tenant always wins.
 * - While the live tenant list is still loading, returns `undefined` so the
 *   caller's resource stays idle rather than firing a request against a name
 *   that is about to be superseded (avoids a doomed 404 on first paint).
 * - Once settled with no tenant, the demo pod is used **only in mock mode** so
 *   fixture-backed UI still renders. In live mode an unresolved tenant means the
 *   caller has no provisioned pod, so it stays `undefined` (idle, an honest
 *   empty state) rather than firing a doomed request against a fixture name the
 *   real control plane will 404.
 *
 * Pure and DI-free so it is unit-testable without Angular. Consumed only by
 * {@link ActiveTenantStore}; not exported from the package barrel, so features
 * resolve the tenant by reading the store signal, never by calling this.
 *
 * @param currentName    - `SessionStore.currentTenant()?.name`, or undefined.
 * @param tenantsLoading - Whether the tenant list resource is still loading.
 * @param mode           - The active {@link GatewayMode} (`mock` or `live`).
 */
export function _ResolveActiveTenant(currentName: string | undefined, tenantsLoading: boolean, mode: GatewayMode): string | undefined
{
	if (currentName)
	{
		return currentName;
	}
	if (tenantsLoading)
	{
		return undefined;
	}
	return mode === "live" ? undefined : _MOCK_DEMO_TENANT;
}
