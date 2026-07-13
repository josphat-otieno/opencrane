import { Injectable, Signal, computed, inject } from "@angular/core";

import { SessionStore } from "@opencrane/state/core";
import { GATEWAY_MODE } from "./gateway-mode.types";
import { _ResolveActiveTenant } from "./active-tenant.util";

/**
 * State-level resolver for the active pod/tenant a data fetch should target.
 *
 * Reconciles the session's `SessionStore.currentTenant` with the active
 * {@link GATEWAY_MODE}: a resolved live tenant always wins; while the tenant
 * list loads it stays `undefined` (consumer resources idle); once settled with
 * no tenant it falls back to a demo pod in mock mode only.
 *
 * Owning the {@link GATEWAY_MODE} read here keeps the mode — and the resolution
 * rule — out of every feature and element. Consumers inject this store and read
 * {@link tenant}; they never inject {@link GATEWAY_MODE} nor call the resolver.
 */
@Injectable({ providedIn: "root" })
export class ActiveTenantStore
{
	/** Session identity/tenant state, sourced from the opencrane-ui. */
	private readonly _session = inject(SessionStore);

	/** Active gateway mode; suppresses the demo-pod fallback in live mode. */
	private readonly _mode = inject(GATEWAY_MODE);

	/** Active pod/tenant name (live), falling back to the demo pod in mock/offline dev. */
	public readonly tenant: Signal<string | undefined> = computed((): string | undefined =>
	{
		return _ResolveActiveTenant(this._session.currentTenant()?.name, this._session.tenants.isLoading(), this._mode);
	});
}
