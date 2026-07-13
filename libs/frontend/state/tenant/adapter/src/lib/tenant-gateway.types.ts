import { InjectionToken } from "@angular/core";

/**
 * Lifecycle phase observed for a UserTenant (an OpenClaw pod inside a customer's
 * ClusterTenant).
 *
 * Mirrors the OpenClaw/tenant lifecycle locally; WeOwnAI is a pure network client
 * and never imports OpenCrane source. The wire `Tenant.phase` field is an
 * unconstrained string in the pinned contract (no enum), so these values are the
 * read-model's own normalisation of that string — a suspended pod scales to zero
 * (`suspend`), a resumed one returns to `running`.
 */
export enum UserTenantPhase
{
	/** Accepted by the API but the pod has not started serving yet. */
	Pending = "pending",
	/** Pod is running and serving. */
	Running = "running",
	/** Pod has been scaled to zero via `suspend`. */
	Suspended = "suspended",
	/** Pod entered a failed state; see the control plane for detail. */
	Failed = "failed"
}

/**
 * Read model for a UserTenant as surfaced to the UI.
 *
 * Represents a single OpenClaw pod living inside a customer's ClusterTenant. The
 * store holds a collection of these and exposes signal selectors over them;
 * `clusterTenantRef` ties the pod back to its parent ClusterTenant so the list
 * can be scoped to one customer.
 */
export interface UserTenant
{
	/** Stable tenant identifier (DNS-safe), unique across the platform. */
	name: string;

	/** Owner's email address, if known. */
	email?: string;

	/** Name of the parent ClusterTenant this pod belongs to, if known. */
	clusterTenantRef?: string;

	/** Public ingress host the pod is served on (`<user>.<baseDomain>`), if assigned. */
	ingressHost?: string;

	/** Observed lifecycle phase; absent until the control plane reports one. */
	phase?: UserTenantPhase;

	/** Whether the pod is currently suspended (scaled to zero). */
	suspended?: boolean;
}

/**
 * Abstraction over the OpenCrane tenants API.
 *
 * Features and the `UserTenantStore` depend only on this interface, so the
 * transport can be swapped (mock → live OpenCrane client, web → desktop) without
 * touching consumer code. Implementations live in this `adapter` lib.
 */
export interface UserTenantGateway
{
	/**
	 * List UserTenants, optionally scoped to a single parent ClusterTenant.
	 *
	 * @param clusterTenantRef - When given, restrict the result to pods whose
	 *                           `clusterTenantRef` matches; omit for every tenant.
	 */
	list(clusterTenantRef?: string): Promise<UserTenant[]>;

	/** Fetch a single UserTenant by name. */
	get(name: string): Promise<UserTenant>;

	/** Suspend a UserTenant (scale its pod to zero). */
	suspend(name: string): Promise<void>;

	/** Resume a previously-suspended UserTenant. */
	resume(name: string): Promise<void>;
}

/** DI token for the active UserTenantGateway implementation. */
export const USER_TENANT_GATEWAY: InjectionToken<UserTenantGateway> = new InjectionToken<UserTenantGateway>("WO_USER_TENANT_GATEWAY");
