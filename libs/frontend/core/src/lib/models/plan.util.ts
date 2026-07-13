import { ClusterTenantCompute, ClusterTenantCreateBody, Plan } from "./plan.types";

/** Identity and placement details supplied per ClusterTenant, independent of the plan. */
export interface PlanIdentity
{
	/** Resource name (DNS-safe identifier). */
	name: string;
	/** Human-readable display name. */
	displayName: string;
	/** Optional base domain for the tenant. */
	baseDomain?: string;
	/** Optional node pool name (used for dedicated-compute tiers). */
	nodePool?: string;
}

/**
 * Maps a subscription plan plus per-tenant identity to an OpenCrane
 * ClusterTenant create body. Pure: no I/O, no mutation of the inputs.
 */
export function _PlanToClusterTenantBody(plan: Plan, identity: PlanIdentity): ClusterTenantCreateBody
{
	// 1. The `shared` tier maps to shared compute; every other tier is dedicated.
	const _isShared: boolean = plan.isolationTier === "shared";
	const _compute: ClusterTenantCompute = _isShared
		? { mode: "shared" }
		: { mode: "dedicated" };

	// 2. Dedicated compute carries a node pool when one was supplied.
	if (!_isShared && identity.nodePool !== undefined)
	{
		_compute.nodePool = identity.nodePool;
	}

	// 3. Carry the plan's isolation tier and quota into the create body.
	const _body: ClusterTenantCreateBody =
	{
		name: identity.name,
		displayName: identity.displayName,
		isolationTier: plan.isolationTier,
		compute: _compute,
		resources: { quota: plan.quota }
	};

	// 4. Forward the base domain only when provided.
	if (identity.baseDomain !== undefined)
	{
		_body.baseDomain = identity.baseDomain;
	}

	return _body;
}
