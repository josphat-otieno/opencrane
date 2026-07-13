import { Injectable, Signal, computed, inject, signal } from "@angular/core";

import { USER_TENANT_GATEWAY, UserTenant } from "./tenant-gateway.types";
import { _FilterByClusterTenant, _SetSuspended, _UpsertUserTenant } from "./tenant-store.util";

/**
 * Headless store over the OpenCrane tenants API.
 *
 * Holds the UserTenant collection (the OpenClaw pods inside a customer's
 * ClusterTenant) as a signal, derives selectors (`byClusterTenant`, `count`)
 * with `computed`, and mutates optimistically — `suspend`/`resume` flip the local
 * row before the network call resolves and reconcile (or roll back) afterwards.
 *
 * Injects only the `USER_TENANT_GATEWAY` contract, so the mock and the live
 * OpenCrane gateway are interchangeable via the app's provider binding.
 */
@Injectable()
export class UserTenantStore
{
	/** Active gateway implementation (mock or live OpenCrane client). */
	private readonly _gateway = inject(USER_TENANT_GATEWAY);

	/** Backing collection of UserTenants. */
	private readonly _tenants = signal<UserTenant[]>([]);

	/** Backing list-in-flight indicator. */
	private readonly _loading = signal<boolean>(false);

	/** Backing last-error message, if the most recent operation failed. */
	private readonly _error = signal<string | null>(null);

	/** The UserTenants currently known to the store. */
	public readonly tenants: Signal<UserTenant[]> = this._tenants.asReadonly();

	/** Whether a list/load is in flight. */
	public readonly loading: Signal<boolean> = this._loading.asReadonly();

	/** Last error message, or null when the most recent operation succeeded. */
	public readonly error: Signal<string | null> = this._error.asReadonly();

	/** Total number of known tenants. */
	public readonly count: Signal<number> = computed((): number =>
	{
		return this._tenants().length;
	});

	/** Tenants grouped by parent ClusterTenant (tenants without a ref are omitted). */
	public readonly byClusterTenantMap: Signal<Map<string, UserTenant[]>> = computed((): Map<string, UserTenant[]> =>
	{
		const grouped = new Map<string, UserTenant[]>();
		for (const tenant of this._tenants())
		{
			const ref = tenant.clusterTenantRef;
			if (ref === undefined)
			{
				continue;
			}
			const bucket = grouped.get(ref) ?? [];
			bucket.push(tenant);
			grouped.set(ref, bucket);
		}
		return grouped;
	});

	/**
	 * Select the tenants belonging to one parent ClusterTenant from local state.
	 *
	 * A synchronous read over the current collection — distinct from `load(ref)`,
	 * which refetches scoped to that ref. Use this for client-side filtering of an
	 * already-loaded collection.
	 *
	 * @param clusterTenantRef - Parent ClusterTenant name to match on.
	 */
	public byClusterTenant(clusterTenantRef: string): UserTenant[]
	{
		return _FilterByClusterTenant(this._tenants(), clusterTenantRef);
	}

	/**
	 * Load the UserTenant collection from the gateway, replacing local state.
	 *
	 * @param clusterTenantRef - When given, load only the pods of that parent
	 *                           ClusterTenant; omit to load every tenant.
	 */
	public async load(clusterTenantRef?: string): Promise<void>
	{
		this._loading.set(true);
		this._error.set(null);
		try
		{
			const tenants = await this._gateway.list(clusterTenantRef);
			this._tenants.set(tenants);
		}
		catch (error)
		{
			this._error.set(this._messageOf(error));
		}
		finally
		{
			this._loading.set(false);
		}
	}

	/**
	 * Suspend a tenant by name. Flips it to suspended optimistically and restores
	 * the prior phase/flag on failure. Returns true when the suspend succeeded.
	 */
	public async suspend(name: string): Promise<boolean>
	{
		return this._toggleSuspended(name, true);
	}

	/**
	 * Resume a tenant by name. Flips it to running optimistically and restores the
	 * prior phase/flag on failure. Returns true when the resume succeeded.
	 */
	public async resume(name: string): Promise<boolean>
	{
		return this._toggleSuspended(name, false);
	}

	/**
	 * Shared optimistic suspend/resume path: flip the local row, call the gateway,
	 * and roll back to the captured prior state when the call rejects.
	 *
	 * @param name      - Tenant to toggle.
	 * @param suspended - True to suspend, false to resume.
	 */
	private async _toggleSuspended(name: string, suspended: boolean): Promise<boolean>
	{
		this._error.set(null);
		const previous = this._tenants();
		this._tenants.update(function applyToggle(current: UserTenant[]): UserTenant[]
		{
			return _SetSuspended(current, name, suspended);
		});
		try
		{
			if (suspended)
			{
				await this._gateway.suspend(name);
			}
			else
			{
				await this._gateway.resume(name);
			}
			return true;
		}
		catch (error)
		{
			this._tenants.set(previous);
			this._error.set(this._messageOf(error));
			return false;
		}
	}

	/**
	 * Refresh a single tenant from the gateway and merge it into the collection.
	 *
	 * UI-driven entry point for reconciling one row (e.g. after an out-of-band
	 * change). Returns the freshly-fetched tenant, or null on failure.
	 */
	public async refresh(name: string): Promise<UserTenant | null>
	{
		try
		{
			const tenant = await this._gateway.get(name);
			this._tenants.update(function merge(current: UserTenant[]): UserTenant[]
			{
				return _UpsertUserTenant(current, tenant);
			});
			return tenant;
		}
		catch (error)
		{
			this._error.set(this._messageOf(error));
			return null;
		}
	}

	/** Narrow an unknown thrown value to a human-readable message. */
	private _messageOf(error: unknown): string
	{
		return error instanceof Error ? error.message : String(error);
	}
}
