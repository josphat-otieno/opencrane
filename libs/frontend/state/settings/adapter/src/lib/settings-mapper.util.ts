import { DatasetAccess, EgressDomain, ScopeLevel, SkillRow } from "@opencrane/core";

import { AccountProfile, AccountProfileUpdate, AwarenessContractInfo, BudgetSpend, PodIdentity } from "./settings-gateway.types";

/**
 * Wire shape of the OpenCrane `Tenant` identity fields the Account section reads.
 *
 * A local projection of the generated `Tenant` contract — only the fields the
 * mapping consumes are declared, all optional as the contract marks them.
 */
export interface AccountTenantWire
{
	/** Stable tenant identifier. */
	name?: string;

	/** Human-readable display name. */
	displayName?: string;

	/** Org-managed email address. */
	email?: string;

	/** Team the tenant belongs to. */
	team?: string;
}

/**
 * Map a wire `Tenant` onto the Account read model.
 *
 * Pure and DI-free so it can be unit-tested directly. Optional wire fields
 * collapse to empty strings; `fallbackName` backstops a missing wire `name`
 * (the caller already knows the tenant it requested).
 *
 * @param wire         - Tenant identity fields as returned by the API.
 * @param fallbackName - Tenant name to use when the wire omits one.
 */
export function _MapAccountProfile(wire: AccountTenantWire, fallbackName: string): AccountProfile
{
	return {
		name: wire.name ?? fallbackName,
		fullName: wire.displayName ?? "",
		email: wire.email ?? "",
		department: wire.team ?? ""
	};
}

/**
 * Patch shape for `PUT /tenants/{name}` — the writable identity fields only.
 *
 * A local projection of the contract's update body; the section never writes
 * `email` (org-managed) or `name` (the immutable path key), so neither appears.
 * Keys are present only when the corresponding edit was supplied, so the request
 * stays a minimal partial update.
 */
export interface AccountTenantPatch
{
	/** New display name, when changing it. */
	displayName?: string;

	/** New team, when changing it. */
	team?: string;
}

/**
 * Map an Account update onto the `PUT /tenants/{name}` patch body.
 *
 * Pure and DI-free so it can be unit-tested directly. Only the fields actually
 * supplied in `update` are emitted (a `fullName`/`department` of `undefined`
 * yields no key), keeping the wire patch minimal and the unspecified fields
 * untouched server-side.
 *
 * @param update - Editable Account fields to persist.
 */
export function _MapAccountUpdateToTenantPatch(update: AccountProfileUpdate): AccountTenantPatch
{
	const patch: AccountTenantPatch = {};
	if (update.fullName !== undefined)
	{
		patch.displayName = update.fullName;
	}
	if (update.department !== undefined)
	{
		patch.team = update.department;
	}
	return patch;
}

/**
 * Map a contract scope token onto the UI {@link ScopeLevel}.
 *
 * The contract uses `team` where the UI scope is `dept`; every other token maps
 * by value. Unknown tokens fall back to personal (the most-restricted scope).
 */
function _ScopeFromWire(scope: string | undefined): ScopeLevel
{
	switch (scope)
	{
		case "org": return ScopeLevel.Org;
		case "team": return ScopeLevel.Dept;
		case "project": return ScopeLevel.Project;
		case "personal": return ScopeLevel.Personal;
		default: return ScopeLevel.Personal;
	}
}

/**
 * Wire shape of `GET /tenants/{name}` for the Pod & Session section.
 *
 * A local projection of the generated `Tenant` contract; all fields optional as
 * the contract marks them.
 */
export interface PodTenantWire
{
	/** Stable tenant identifier. */
	name?: string;

	/** Human-readable display name. */
	displayName?: string;

	/** Org-managed email address. */
	email?: string;

	/** Team the tenant belongs to. */
	team?: string;

	/** Lifecycle phase. */
	phase?: string;

	/** Ingress host the pod is reachable on. */
	ingressHost?: string;

	/** ISO creation timestamp. */
	createdAt?: string;
}

/**
 * Map a wire `Tenant` onto the Pod identity read model.
 *
 * Pure and DI-free. Optional wire fields collapse to empty strings;
 * `fallbackName` backstops a missing wire `name`.
 *
 * @param wire         - Tenant fields as returned by the API.
 * @param fallbackName - Tenant name to use when the wire omits one.
 */
export function _MapPodIdentity(wire: PodTenantWire, fallbackName: string): PodIdentity
{
	return {
		name: wire.name ?? fallbackName,
		displayName: wire.displayName ?? "",
		email: wire.email ?? "",
		team: wire.team ?? "",
		phase: wire.phase ?? "",
		ingressHost: wire.ingressHost ?? "",
		createdAt: wire.createdAt ?? ""
	};
}

/**
 * Wire shape of `GET /ai-budget/{tenantName}/spend`.
 *
 * Local projection; fields optional as the contract marks them.
 */
export interface BudgetSpendWire
{
	/** Monthly spend ceiling in USD. */
	monthlyLimitUsd?: number;

	/** Spend so far this month in USD. */
	currentSpendUsd?: number;

	/** Alert band (`ok` | `warning` | `exceeded`). */
	budgetAlertState?: string;
}

/**
 * Map a wire spend payload onto the Budget read model.
 *
 * Pure and DI-free. Missing figures collapse to `0`; an unrecognised alert band
 * falls back to `ok`.
 *
 * @param wire - Spend fields as returned by the API.
 */
export function _MapBudgetSpend(wire: BudgetSpendWire): BudgetSpend
{
	const alert = wire.budgetAlertState;
	return {
		monthlyLimitUsd: wire.monthlyLimitUsd ?? 0,
		currentSpendUsd: wire.currentSpendUsd ?? 0,
		alertState: alert === "warning" || alert === "exceeded" ? alert : "ok"
	};
}

/**
 * Wire shape of the typed fields on `GET /tenants/{name}/effective-contract`.
 *
 * Only the flat identity fields are projected; the nested `awareness`/`mcp`/
 * `skills` blocks are opaque in the pinned contract.
 */
export interface EffectiveContractWire
{
	/** Stable contract identifier. */
	contractId?: string;

	/** Resolved contract version string. */
	contractVersion?: string;
}

/**
 * Map a wire effective-contract payload onto the Awareness identity read model.
 *
 * Pure and DI-free. Missing fields collapse to empty strings.
 *
 * @param wire - Effective-contract fields as returned by the API.
 */
export function _MapAwarenessContract(wire: EffectiveContractWire): AwarenessContractInfo
{
	return {
		contractId: wire.contractId ?? "",
		contractVersion: wire.contractVersion ?? ""
	};
}

/**
 * Wire shape of `GET /tenants/{name}/datasets` — dataset names grouped by scope.
 */
export interface DatasetsWire
{
	/** Org-scope dataset names. */
	org?: string[];

	/** Team (dept)-scope dataset names. */
	team?: string[];

	/** Project-scope dataset names. */
	project?: string[];

	/** Personal-scope dataset names. */
	personal?: string[];
}

/**
 * Map the scoped dataset-name lists onto Access membership rows.
 *
 * Pure and DI-free. The contract exposes only names per scope, so access mode,
 * entry counts and grant dates are not known here and are left as neutral
 * defaults (`read` / `0` / `—`); the names themselves are authoritative.
 *
 * @param wire - Scoped dataset-name lists as returned by the API.
 */
export function _MapDatasetAccess(wire: DatasetsWire): DatasetAccess[]
{
	const rows: DatasetAccess[] = [];
	const scopes: { key: keyof DatasetsWire; scope: ScopeLevel }[] =
	[
		{ key: "org", scope: ScopeLevel.Org },
		{ key: "team", scope: ScopeLevel.Dept },
		{ key: "project", scope: ScopeLevel.Project },
		{ key: "personal", scope: ScopeLevel.Personal }
	];
	for (const { key, scope } of scopes)
	{
		for (const name of wire[key] ?? [])
		{
			rows.push({ name, scope, access: "read", entries: 0, granted: "—" });
		}
	}
	return rows;
}

/**
 * Wire shape of a `GET /skills/catalog` row.
 *
 * Local projection of the fields the Skills table renders.
 */
export interface SkillCatalogWire
{
	/** Skill name. */
	name?: string;

	/** Version string. */
	version?: string;

	/** OCI digest. */
	digest?: string;

	/** Scope token (`org` | `team` | `project` | `personal`). */
	scope?: string;

	/** Publication status (`draft` | `published` | `deprecated`). */
	status?: string;
}

/**
 * Map skill-catalogue rows onto the Skills table read model.
 *
 * Pure and DI-free. The contract's publication status maps onto the table's
 * status vocabulary (`published` → `active`, `draft` → `pending-promotion`),
 * with any other value passed through. Missing strings collapse to `—`.
 *
 * @param wire - Catalogue rows as returned by the API.
 */
export function _MapSkills(wire: SkillCatalogWire[]): SkillRow[]
{
	return wire.map(function mapRow(row: SkillCatalogWire): SkillRow
	{
		const status = row.status === "published"
			? "active"
			: row.status === "draft" ? "pending-promotion" : row.status ?? "active";
		return {
			name: row.name ?? "—",
			scope: _ScopeFromWire(row.scope),
			version: row.version ?? "—",
			digest: row.digest ?? "—",
			status
		};
	});
}

/**
 * Wire shape of a `GET /policies` row.
 *
 * Local projection of the fields the egress allowlist renders.
 */
export interface PolicyWire
{
	/** Policy name. */
	name?: string;

	/** Allowed egress domains. */
	domains?: string[];
}

/**
 * Flatten network policies onto egress-allowlist rows.
 *
 * Pure and DI-free. Each policy domain becomes one row; the originating policy
 * name is surfaced as the row purpose. Rows are deduplicated by domain (first
 * policy wins). Status is reported `active` — the contract has no per-domain
 * lifecycle field.
 *
 * @param wire - Policy rows as returned by the API.
 */
export function _MapEgressDomains(wire: PolicyWire[]): EgressDomain[]
{
	const seen = new Set<string>();
	const rows: EgressDomain[] = [];
	for (const policy of wire)
	{
		for (const domain of policy.domains ?? [])
		{
			if (seen.has(domain))
			{
				continue;
			}
			seen.add(domain);
			rows.push({ domain, purpose: policy.name ?? "Network policy", status: "active" });
		}
	}
	return rows;
}
