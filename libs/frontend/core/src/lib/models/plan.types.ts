/**
 * Cluster isolation tier for a tenant.
 *
 * Mirrors the OpenCrane ClusterTenant contract locally; WeOwnAI is a network
 * client and does not import OpenCrane source.
 */
export type ClusterIsolationTier = "shared" | "dedicatedNodes" | "dedicatedCluster";

/**
 * Compute mode for a ClusterTenant.
 *
 * Mirrors the OpenCrane ClusterTenant contract locally; `"dedicated"` requires
 * an accompanying node pool.
 */
export type ClusterComputeMode = "shared" | "dedicated";

/** Resource quota requested for a tenant (mirrors the OpenCrane contract). */
export interface PlanQuota
{
	/** CPU quota (Kubernetes quantity, e.g. "2"). */
	cpu?: string;
	/** Memory quota (Kubernetes quantity, e.g. "4Gi"). */
	memory?: string;
	/** Maximum number of pods. */
	pods?: number;
	/** Persistent storage quota (Kubernetes quantity, e.g. "20Gi"). */
	storage?: string;
	/** Number of GPUs. */
	gpu?: number;
}

/** A subscription plan offered to WeOwnAI customers. */
export interface Plan
{
	/** Stable plan id. */
	id: string;
	/** Human-readable plan name. */
	name: string;
	/** Cluster isolation tier this plan provisions. */
	isolationTier: ClusterIsolationTier;
	/** Resource quota granted by the plan. */
	quota: PlanQuota;
	/** Display-ready price string (e.g. "$49 / month"). */
	priceDisplay: string;
	/** Whether the plan is available via public self-serve signup (false ⇒ operator-initiated/enterprise). */
	selfServe: boolean;
}

/** Compute block of a ClusterTenant create body (mirrors the OpenCrane contract). */
export interface ClusterTenantCompute
{
	/** Compute mode for the tenant. */
	mode: ClusterComputeMode;
	/** Node pool name; required when `mode` is `"dedicated"`. */
	nodePool?: string;
}

/** Resources block of a ClusterTenant create body (mirrors the OpenCrane contract). */
export interface ClusterTenantResources
{
	/** Requested resource quota. */
	quota: PlanQuota;
}

/**
 * OpenCrane ClusterTenant create body.
 *
 * Mirrors the OpenCrane ClusterTenant contract locally so the plan mapping is
 * typed; WeOwnAI is a network client and does not import OpenCrane source.
 */
export interface ClusterTenantCreateBody
{
	/** Resource name (DNS-safe identifier). */
	name: string;
	/** Human-readable display name. */
	displayName: string;
	/** Optional base domain for the tenant. */
	baseDomain?: string;
	/** Cluster isolation tier. */
	isolationTier: ClusterIsolationTier;
	/** Compute configuration. */
	compute: ClusterTenantCompute;
	/** Resource configuration. */
	resources: ClusterTenantResources;
}
