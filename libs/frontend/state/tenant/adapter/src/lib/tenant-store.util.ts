import { UserTenant, UserTenantPhase } from "./tenant-gateway.types";

/**
 * Pure collection helpers for the UserTenant store, factored out so the
 * optimistic suspend/resume and filter rules can be unit-tested without Angular
 * DI. Each returns a new array (the store holds an immutable signal) and matches
 * tenants by their stable `name` key.
 */

/**
 * Insert `tenant`, or replace an existing entry with the same `name`.
 *
 * Used for reconciling a server response onto whatever is currently in the
 * collection without duplicating the row.
 *
 * @param current - The tenants currently held by the store.
 * @param tenant  - The tenant to insert or replace.
 */
export function _UpsertUserTenant(current: UserTenant[], tenant: UserTenant): UserTenant[]
{
	const index = current.findIndex(function byName(candidate: UserTenant): boolean
	{
		return candidate.name === tenant.name;
	});
	if (index < 0)
	{
		return [...current, tenant];
	}
	const copy = [...current];
	copy[index] = tenant;
	return copy;
}

/**
 * Flip the suspended state of the tenant with the given `name`, if present.
 *
 * Drives optimistic suspend/resume: sets `suspended` and moves `phase` to
 * `Suspended` (when suspending) or `Running` (when resuming) before the network
 * call resolves. Returns the same array reference when no tenant matches, so an
 * action against a tenant that has since been removed is a no-op.
 *
 * @param current   - The tenants currently held by the store.
 * @param name      - Key of the tenant whose suspended state changed.
 * @param suspended - True to suspend, false to resume.
 */
export function _SetSuspended(current: UserTenant[], name: string, suspended: boolean): UserTenant[]
{
	const index = current.findIndex(function byName(candidate: UserTenant): boolean
	{
		return candidate.name === name;
	});
	if (index < 0)
	{
		return current;
	}
	const copy = [...current];
	copy[index] = { ...copy[index], suspended, phase: suspended ? UserTenantPhase.Suspended : UserTenantPhase.Running };
	return copy;
}

/**
 * Filter the collection to the tenants belonging to one parent ClusterTenant.
 *
 * @param current          - The tenants currently held by the store.
 * @param clusterTenantRef - Parent ClusterTenant name to match on.
 */
export function _FilterByClusterTenant(current: UserTenant[], clusterTenantRef: string): UserTenant[]
{
	return current.filter(function byRef(candidate: UserTenant): boolean
	{
		return candidate.clusterTenantRef === clusterTenantRef;
	});
}
