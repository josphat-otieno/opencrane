import { Injectable } from "@angular/core";

import { UserTenant, UserTenantGateway, UserTenantPhase } from "@opencrane/state/tenant/adapter";
import { _FilterByClusterTenant } from "@opencrane/state/tenant/adapter";

const _BASE_DOMAINS: Readonly<Record<string, string>> = { acme: "ai.acme.example", globex: "ai.globex.example" };

interface _SeedSpec { name: string; email: string; clusterTenantRef: string; phase: UserTenantPhase; }

const _SEEDS: readonly _SeedSpec[] = [
	{ name: "mike", email: "mike@acme.example", clusterTenantRef: "acme", phase: UserTenantPhase.Running },
	{ name: "sara", email: "sara@acme.example", clusterTenantRef: "acme", phase: UserTenantPhase.Running },
	{ name: "leo", email: "leo@acme.example", clusterTenantRef: "acme", phase: UserTenantPhase.Suspended },
	{ name: "nina", email: "nina@globex.example", clusterTenantRef: "globex", phase: UserTenantPhase.Running },
	{ name: "omar", email: "omar@globex.example", clusterTenantRef: "globex", phase: UserTenantPhase.Pending }
];

/** In-memory UserTenantGateway for tests — never imported by production code. */
@Injectable()
export class MockUserTenantGateway implements UserTenantGateway
{
	private readonly _tenants = new Map<string, UserTenant>();

	public constructor() { this._seed(); }

	public list(clusterTenantRef?: string): Promise<UserTenant[]>
	{
		const all = Array.from(this._tenants.values(), this._clone.bind(this));
		return Promise.resolve(clusterTenantRef === undefined ? all : _FilterByClusterTenant(all, clusterTenantRef));
	}

	public get(name: string): Promise<UserTenant>
	{
		const t = this._tenants.get(name);
		if (!t) return Promise.reject(new Error(`tenant not found: ${name}`));
		return Promise.resolve(this._clone(t));
	}

	public suspend(name: string): Promise<void> { return this._setSuspended(name, true); }
	public resume(name: string): Promise<void> { return this._setSuspended(name, false); }

	private _setSuspended(name: string, suspended: boolean): Promise<void>
	{
		const t = this._tenants.get(name);
		if (!t) return Promise.reject(new Error(`tenant not found: ${name}`));
		this._tenants.set(name, { ...t, suspended, phase: suspended ? UserTenantPhase.Suspended : UserTenantPhase.Running });
		return Promise.resolve();
	}

	private _clone(t: UserTenant): UserTenant { return { ...t }; }

	private _seed(): void
	{
		for (const spec of _SEEDS)
		{
			const base = _BASE_DOMAINS[spec.clusterTenantRef] ?? `${spec.clusterTenantRef}.example`;
			this._tenants.set(spec.name, { name: spec.name, email: spec.email, clusterTenantRef: spec.clusterTenantRef, ingressHost: `${spec.name}.${base}`, phase: spec.phase, suspended: spec.phase === UserTenantPhase.Suspended });
		}
	}
}
