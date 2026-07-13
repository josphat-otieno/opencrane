import { Injectable, inject } from "@angular/core";

import { ControlPlaneApiService } from "@opencrane/core";

import { UserTenant, UserTenantGateway, UserTenantPhase } from "./tenant-gateway.types";
import { _FilterByClusterTenant } from "./tenant-store.util";

/**
 * Wire shape of a tenant as returned by the OpenCrane tenants API.
 *
 * Mirrors the pinned contract's `Tenant` schema locally (all fields optional);
 * the contract has no dedicated parent-ClusterTenant field, so `team` carries the
 * owning ClusterTenant and is mapped onto `clusterTenantRef`.
 */
interface UserTenantWire
{
	/** Stable tenant identifier. */
	name?: string;

	/** Owner email address. */
	email?: string;

	/** Owning group; carries the parent ClusterTenant name in this deployment. */
	team?: string;

	/** Lifecycle phase string from the control plane (unconstrained in the contract). */
	phase?: string;

	/** Public ingress host the pod is served on. */
	ingressHost?: string;
}

/**
 * Live UserTenantGateway backed by the OpenCrane tenants API.
 *
 * Issues typed GET/POST through the shared `ControlPlaneApiService` (the openapi-fetch
 * client generated from the pinned contract) against `/tenants`,
 * `/tenants/{name}`, `/tenants/{name}/suspend`, and `/tenants/{name}/resume`,
 * mapping each response onto the `UserTenant` read model. The contract has no
 * query parameter for scoping the list, so `list(ref)` filters client-side.
 * WeOwnAI never imports OpenCrane source; this network contract is the only
 * coupling.
 *
 * Bound as the default provider in both apps via their respective gateway
 * provider functions.
 */
@Injectable()
export class OpenCraneUserTenantGateway implements UserTenantGateway
{
	/** Typed OpenCrane opencrane-ui client. */
	private readonly _api = inject(ControlPlaneApiService);

	/** @inheritdoc */
	public async list(clusterTenantRef?: string): Promise<UserTenant[]>
	{
		const { data, error } = await this._api.client.GET("/tenants");
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, "failed to list tenants"));
		}
		const tenants = (data as UserTenantWire[]).map(this._mapTenant.bind(this));
		if (clusterTenantRef === undefined)
		{
			return tenants;
		}
		return _FilterByClusterTenant(tenants, clusterTenantRef);
	}

	/** @inheritdoc */
	public async get(name: string): Promise<UserTenant>
	{
		const { data, error } = await this._api.client.GET("/tenants/{name}", { params: { path: { name } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load tenant: ${name}`));
		}
		return this._mapTenant(data as UserTenantWire);
	}

	/** @inheritdoc */
	public async suspend(name: string): Promise<void>
	{
		const { error } = await this._api.client.POST("/tenants/{name}/suspend", { params: { path: { name } } });
		if (error)
		{
			throw new Error(this._errorMessage(error, `failed to suspend tenant: ${name}`));
		}
	}

	/** @inheritdoc */
	public async resume(name: string): Promise<void>
	{
		const { error } = await this._api.client.POST("/tenants/{name}/resume", { params: { path: { name } } });
		if (error)
		{
			throw new Error(this._errorMessage(error, `failed to resume tenant: ${name}`));
		}
	}

	/** Map a wire tenant onto the read model, deriving the suspended flag from the phase. */
	private _mapTenant(wire: UserTenantWire): UserTenant
	{
		const phase = this._mapPhase(wire.phase);
		return {
			name: wire.name ?? "",
			email: wire.email,
			clusterTenantRef: wire.team,
			ingressHost: wire.ingressHost,
			phase,
			suspended: phase === UserTenantPhase.Suspended
		};
	}

	/** Narrow a wire phase string onto the enum, defaulting to pending when absent/unknown. */
	private _mapPhase(phase: string | undefined): UserTenantPhase
	{
		switch (phase)
		{
			case UserTenantPhase.Running:
				return UserTenantPhase.Running;
			case UserTenantPhase.Suspended:
				return UserTenantPhase.Suspended;
			case UserTenantPhase.Failed:
				return UserTenantPhase.Failed;
			default:
				return UserTenantPhase.Pending;
		}
	}

	/** Build a user-facing message from the API error payload, falling back to `fallback`.
	 *  Never surfaces `detail` — it may contain server internals. */
	private _errorMessage(error: unknown, fallback: string): string
	{
		if (!error || typeof error !== "object") return fallback;
		const e = error as Record<string, unknown>;
		if (typeof e["code"] === "string")
		{
			switch (e["code"])
			{
				case "UNAUTHORIZED": return "You are not authorised to perform this action.";
				case "FORBIDDEN": return "You do not have permission to perform this action.";
			}
		}
		if (typeof e["error"] === "string" && e["error"]) return e["error"];
		return fallback;
	}
}
