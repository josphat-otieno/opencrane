import { ChangeDetectionStrategy, Component, computed, effect, inject } from "@angular/core";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";

import { SessionStore } from "@opencrane/state/core";
import { UserTenant, UserTenantStore } from "@opencrane/state/tenant/adapter";
import { UserTenantPhaseBadgeComponent } from "../user-tenant-phase-badge/user-tenant-phase-badge.component";
import { UserTenantRow } from "../customer-admin.types";
import { _ToUserTenantRows } from "../customer-admin.util";

/**
 * Customer-admin console — a customer's own admin manages the UserTenants (the
 * OpenClaw pods) inside *their* ClusterTenant.
 *
 * This is account-scoped, not a WeOwnAI platform-operator view: access is gated
 * in-component on {@link SessionStore.capabilities}`().customerAdmin` (a route
 * guard can tighten this later — gated here for now), and the listing is scoped
 * to the admin's own ClusterTenant rather than the whole fleet.
 *
 * Injects the {@link UserTenantStore} and triggers `load()` from the constructor
 * (not a template method), then reads its signals directly. The table renders a
 * `computed` {@link rows} view-model so per-row formatting is derived once per
 * change rather than via helper calls on the hot template path; suspend/resume
 * row actions go straight to the store's optimistic mutators.
 */
@Component({
	selector: "wo-customer-admin",
	standalone: true,
	imports: [TableModule, ButtonModule, UserTenantPhaseBadgeComponent],
	templateUrl: "./customer-admin-page.component.html",
	styleUrl: "./customer-admin-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerAdminPageComponent
{
	/** App-wide session/identity state (drives the capability gate + tenant scope). */
	private readonly _session = inject(SessionStore);

	/** UserTenant store (mock or live gateway, bound by the app). */
	private readonly _store = inject(UserTenantStore);

	/**
	 * Whether the session may use the customer-admin console. When false the
	 * template renders a graceful no-access state; the API remains the real
	 * enforcement point — this flag only hides controls.
	 */
	public readonly canAdminister = computed<boolean>(() => this._session.capabilities().customerAdmin);

	/**
	 * The admin's ClusterTenant scope, taken from the session's `clusterTenant`
	 * claim (emitted by the live `/auth/me`; see {@link SessionUser}).
	 *
	 * Resolves to undefined when the claim is absent (mock/offline dev, or a
	 * session not bound to a ClusterTenant) — in which case the store loads every
	 * UserTenant, acceptable only for the fixture-backed demo. Against the live
	 * control plane a real customer admin always carries a `clusterTenant`, so the
	 * console scopes to their own org rather than the whole fleet.
	 */
	public readonly clusterTenantRef = computed<string | undefined>(() =>
	{
		const ref = this._session.user()?.clusterTenant;
		return ref && ref.length > 0 ? ref : undefined;
	});

	/** Whether the list is loading (drives the table's loading state). */
	public readonly loading = this._store.loading;

	/** Last store error, surfaced under the table header. */
	public readonly error = this._store.error;

	/**
	 * The UserTenants in scope: the admin's own ClusterTenant when resolved, else
	 * the full collection (the demo fallback). A `computed` over the store's signal
	 * so it re-derives when either the loaded collection or the scope changes.
	 */
	private readonly _scopedTenants = computed<UserTenant[]>(() =>
	{
		const ref = this.clusterTenantRef();
		const all = this._store.tenants();
		return ref ? all.filter(function byRef(tenant: UserTenant): boolean
		{
			return tenant.clusterTenantRef === ref;
		}) : all;
	});

	/** Pre-formatted row view-models for the console table (memoised). */
	public readonly rows = computed<UserTenantRow[]>(() => _ToUserTenantRows(this._scopedTenants()));

	/** Count of in-scope UserTenants (header count). */
	public readonly count = computed<number>(() => this._scopedTenants().length);

	/** Whether the empty-state row should show (loaded with no tenants in scope). */
	public readonly isEmpty = computed<boolean>(() => !this.loading() && this.rows().length === 0);

	/** Guards the capability-gated load so it fires exactly once. */
	private _loaded = false;

	public constructor()
	{
		// Load when the capability gate first opens — via an effect, not a one-shot
		// constructor read: a session still resolving at construction (gate briefly
		// false) would otherwise never load once it authenticates. Scoped to the
		// admin's ClusterTenant when known; the store loads all when the ref is undefined.
		effect(() =>
		{
			if (this._loaded || !this.canAdminister())
			{
				return;
			}
			this._loaded = true;
			void this._store.load(this.clusterTenantRef());
		});
	}

	/** Suspend a UserTenant (scale its pod to zero) via the store's optimistic path. */
	public suspend(row: UserTenantRow): void
	{
		void this._store.suspend(row.name);
	}

	/** Resume a previously-suspended UserTenant via the store's optimistic path. */
	public resume(row: UserTenantRow): void
	{
		void this._store.resume(row.name);
	}
}
