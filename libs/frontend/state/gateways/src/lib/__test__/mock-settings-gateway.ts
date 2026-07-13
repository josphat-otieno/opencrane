import { Injectable } from "@angular/core";

import { DatasetAccess, EgressDomain, SkillRow } from "@opencrane/core";
import { DATASET_ACCESS, EGRESS_DOMAINS, SKILLS } from "@opencrane/core/testing";
import { AccountProfile, AccountProfileUpdate, AwarenessContractInfo, BudgetSpend, PodIdentity, SettingsGateway } from "@opencrane/state/settings/adapter";

const _FIXTURE: AccountProfile = { name: "alex.oc", fullName: "Alex Kim", email: "alex.kim@acme-corp.com", department: "Product" };

/** In-memory SettingsGateway for tests — never imported by production code. */
@Injectable()
export class MockSettingsGateway implements SettingsGateway
{
	private readonly _byTenant = new Map<string, AccountProfile>();

	public getAccountProfile(tenantName: string): Promise<AccountProfile> { return Promise.resolve({ ...this._seeded(tenantName) }); }

	public updateAccountProfile(tenantName: string, update: AccountProfileUpdate): Promise<AccountProfile>
	{
		const current = this._seeded(tenantName);
		const next: AccountProfile = { ...current, fullName: update.fullName ?? current.fullName, department: update.department ?? current.department };
		this._byTenant.set(tenantName, next);
		return Promise.resolve({ ...next });
	}

	public getPodIdentity(tenantName: string): Promise<PodIdentity>
	{
		const p = this._seeded(tenantName);
		return Promise.resolve({ name: tenantName, displayName: p.fullName, email: p.email, team: p.department, phase: "running", ingressHost: `${tenantName}.acme-corp.opencrane.ai`, createdAt: "2026-01-12T09:00:00.000Z" });
	}

	public getBudgetSpend(_t: string): Promise<BudgetSpend> { return Promise.resolve({ monthlyLimitUsd: 100, currentSpendUsd: 82.4, alertState: "warning" }); }
	public getAwarenessContract(_t: string): Promise<AwarenessContractInfo> { return Promise.resolve({ contractId: "contract-acme-corp", contractVersion: "v2.3.1" }); }
	public getDatasetAccess(_t: string): Promise<DatasetAccess[]> { return Promise.resolve(DATASET_ACCESS.map((r): DatasetAccess => ({ ...r }))); }
	public getSkills(): Promise<SkillRow[]> { return Promise.resolve(SKILLS.map((r): SkillRow => ({ ...r }))); }
	public getEgressDomains(): Promise<EgressDomain[]> { return Promise.resolve(EGRESS_DOMAINS.map((r): EgressDomain => ({ ...r }))); }

	private _seeded(tenantName: string): AccountProfile
	{
		const ex = this._byTenant.get(tenantName);
		if (ex) return ex;
		const s: AccountProfile = { ..._FIXTURE, name: tenantName };
		this._byTenant.set(tenantName, s);
		return s;
	}
}
