import { Injectable, inject } from "@angular/core";

import { ControlPlaneApiService, DatasetAccess, EgressDomain, SkillRow } from "@opencrane/core";

import { AccountProfile, AccountProfileUpdate, AwarenessContractInfo, BudgetSpend, PodIdentity, SettingsGateway } from "./settings-gateway.types";
import {
	AccountTenantWire,
	BudgetSpendWire,
	DatasetsWire,
	EffectiveContractWire,
	PodTenantWire,
	PolicyWire,
	SkillCatalogWire,
	_MapAccountProfile,
	_MapAccountUpdateToTenantPatch,
	_MapAwarenessContract,
	_MapBudgetSpend,
	_MapDatasetAccess,
	_MapEgressDomains,
	_MapPodIdentity,
	_MapSkills
} from "./settings-mapper.util";

/**
 * Live SettingsGateway backed by the OpenCrane Tenants API.
 *
 * Issues typed `GET`/`PUT /tenants/{name}` through the shared `ControlPlaneApiService`
 * (the openapi-fetch client generated from the pinned contract) and maps the
 * `Tenant` response onto the `AccountProfile` read model. WeOwnAI never imports
 * OpenCrane source; this network contract is the only coupling.
 *
 * Bound as the default provider in the operator app via `provideControlPlaneGateways`.
 */
@Injectable()
export class OpenCraneSettingsGateway implements SettingsGateway
{
	/** Typed OpenCrane opencrane-ui client. */
	private readonly _api = inject(ControlPlaneApiService);

	/** @inheritdoc */
	public async getAccountProfile(tenantName: string): Promise<AccountProfile>
	{
		const { data, error } = await this._api.client.GET("/tenants/{name}", { params: { path: { name: tenantName } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load account profile: ${tenantName}`));
		}
		return _MapAccountProfile(data as AccountTenantWire, tenantName);
	}

	/** @inheritdoc */
	public async updateAccountProfile(tenantName: string, update: AccountProfileUpdate): Promise<AccountProfile>
	{
		const body = _MapAccountUpdateToTenantPatch(update);
		const { error } = await this._api.client.PUT("/tenants/{name}", { params: { path: { name: tenantName } }, body });
		if (error)
		{
			throw new Error(this._errorMessage(error, `failed to update account profile: ${tenantName}`));
		}
		// `PUT /tenants/{name}` returns only `{ name, status }`, not the full
		// tenant — re-read for the authoritative, fully-populated profile.
		return this.getAccountProfile(tenantName);
	}

	/** @inheritdoc */
	public async getPodIdentity(tenantName: string): Promise<PodIdentity>
	{
		const { data, error } = await this._api.client.GET("/tenants/{name}", { params: { path: { name: tenantName } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load pod identity: ${tenantName}`));
		}
		return _MapPodIdentity(data as PodTenantWire, tenantName);
	}

	/** @inheritdoc */
	public async getBudgetSpend(tenantName: string): Promise<BudgetSpend>
	{
		const { data, error } = await this._api.client.GET("/ai-budget/{tenantName}/spend", { params: { path: { tenantName } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load budget spend: ${tenantName}`));
		}
		return _MapBudgetSpend(data as BudgetSpendWire);
	}

	/** @inheritdoc */
	public async getAwarenessContract(tenantName: string): Promise<AwarenessContractInfo>
	{
		const { data, error } = await this._api.client.GET("/tenants/{name}/effective-contract", { params: { path: { name: tenantName } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load awareness contract: ${tenantName}`));
		}
		return _MapAwarenessContract(data as EffectiveContractWire);
	}

	/** @inheritdoc */
	public async getDatasetAccess(tenantName: string): Promise<DatasetAccess[]>
	{
		const { data, error } = await this._api.client.GET("/tenants/{name}/datasets", { params: { path: { name: tenantName } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load dataset access: ${tenantName}`));
		}
		return _MapDatasetAccess(data as DatasetsWire);
	}

	/** @inheritdoc */
	public async getSkills(): Promise<SkillRow[]>
	{
		const { data, error } = await this._api.client.GET("/skills/catalog");
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, "failed to load skill catalogue"));
		}
		return _MapSkills(data as SkillCatalogWire[]);
	}

	/** @inheritdoc */
	public async getEgressDomains(): Promise<EgressDomain[]>
	{
		const { data, error } = await this._api.client.GET("/policies");
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, "failed to load network policies"));
		}
		return _MapEgressDomains(data as PolicyWire[]);
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
