import { InjectionToken } from "@angular/core";

import { DatasetAccess, EgressDomain, SkillRow } from "@opencrane/core";

/**
 * Read model for the Account settings section.
 *
 * Mirrors the identity fields the OpenCrane `Tenant` contract exposes for a pod
 * (`/tenants/{name}`) and that the Account section renders: full name, the
 * org-managed email, and the team the pod belongs to. WeOwnAI is a pure network
 * client and never imports OpenCrane source — this is a local projection of the
 * wire shape, not a re-export of it.
 */
export interface AccountProfile
{
	/** Stable pod/tenant identifier the profile was loaded for. */
	name: string;

	/** Display name shown in the "Full name" field. */
	fullName: string;

	/** Org-managed email address (read-only in the section). */
	email: string;

	/** Team the pod belongs to, surfaced as "Department". */
	department: string;
}

/**
 * Editable subset of {@link AccountProfile} the Account/Pod section can persist.
 *
 * Only the writable identity fields appear: `email` is org-managed and read-only
 * in the section, and `name` is the immutable pod key (the path param), so
 * neither is updatable here. Both fields are optional so a caller can patch one
 * without the other (maps onto the partial `PUT /tenants/{name}` body).
 */
export interface AccountProfileUpdate
{
	/** New display name ("Full name"), when changing it. */
	fullName?: string;

	/** New team ("Department"), when changing it. */
	department?: string;
}

/**
 * Read model for the Model & Budget section's live spend figures.
 *
 * Local projection of `GET /ai-budget/{tenantName}/spend`. The model catalogue
 * and routing classes the section also renders are static configuration, not
 * part of this per-tenant read.
 */
export interface BudgetSpend
{
	/** Monthly spend ceiling in USD. */
	monthlyLimitUsd: number;

	/** Spend so far this month in USD. */
	currentSpendUsd: number;

	/** Budget alert band derived server-side. */
	alertState: "ok" | "warning" | "exceeded";
}

/**
 * Read model for the Awareness Contract section's identity banner.
 *
 * Local projection of the typed fields on `GET /tenants/{name}/effective-contract`
 * (`contractId`, `contractVersion`); the nested `awareness`/`mcp`/`skills` blocks
 * are opaque in the pinned contract, so the rich per-dataset Cognee stats the
 * section also shows remain fixture-backed until an endpoint exposes them.
 */
export interface AwarenessContractInfo
{
	/** Stable contract identifier. */
	contractId: string;

	/** Resolved contract version string (e.g. `v2.3.1`). */
	contractVersion: string;
}

/**
 * Read model for the Pod & Session section's identity/state fields.
 *
 * Local projection of `GET /tenants/{name}` — the pod's name, display name,
 * org-managed email, team, lifecycle phase, ingress host and creation time.
 * Storage/runtime-version figures are not exposed by the pinned contract.
 */
export interface PodIdentity
{
	/** Stable pod/tenant identifier. */
	name: string;

	/** Human-readable display name. */
	displayName: string;

	/** Org-managed email address. */
	email: string;

	/** Team the pod belongs to. */
	team: string;

	/** Lifecycle phase (e.g. `running`, `provisioning`). */
	phase: string;

	/** Ingress host the pod is reachable on. */
	ingressHost: string;

	/** ISO creation timestamp, or empty when the contract omits it. */
	createdAt: string;
}

/**
 * Abstraction over the OpenCrane settings reads/writes backing the operator
 * app's settings sections.
 *
 * Components depend only on this interface, so the data source can be swapped
 * (mock fixtures → live OpenCrane client, web → desktop) without touching the
 * section components. Implementations live in this `adapter` lib; the binding is
 * provided in the app's `app.config.ts`. Carries the Account/Pod read + write the
 * migrated section needs; further sections add methods here as they move off
 * fixtures.
 */
export interface SettingsGateway
{
	/**
	 * Load the account profile for a pod by its tenant name.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getAccountProfile(tenantName: string): Promise<AccountProfile>;

	/**
	 * Persist edits to a pod's account profile and resolve with the saved profile.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param update     - The fields to change (see {@link AccountProfileUpdate}).
	 */
	updateAccountProfile(tenantName: string, update: AccountProfileUpdate): Promise<AccountProfile>;

	/**
	 * Load a pod's identity/state for the Pod & Session section.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getPodIdentity(tenantName: string): Promise<PodIdentity>;

	/**
	 * Load a pod's live monthly spend for the Model & Budget section.
	 *
	 * @param tenantName - Stable pod/tenant identifier.
	 */
	getBudgetSpend(tenantName: string): Promise<BudgetSpend>;

	/**
	 * Load a pod's effective awareness-contract identity for the Awareness section.
	 *
	 * @param tenantName - Stable pod/tenant identifier.
	 */
	getAwarenessContract(tenantName: string): Promise<AwarenessContractInfo>;

	/**
	 * Load a pod's dataset memberships for the Access & Datasets section.
	 *
	 * @param tenantName - Stable pod/tenant identifier.
	 */
	getDatasetAccess(tenantName: string): Promise<DatasetAccess[]>;

	/**
	 * Load the skill catalogue rows for the Skills section.
	 *
	 * Cluster-wide (`GET /skills/catalog`), so it takes no tenant key.
	 */
	getSkills(): Promise<SkillRow[]>;

	/**
	 * Load the egress allowlist rows for the Network & Egress section.
	 *
	 * Flattened from the cluster network policies (`GET /policies`).
	 */
	getEgressDomains(): Promise<EgressDomain[]>;
}

/** DI token for the active SettingsGateway implementation. */
export const SETTINGS_GATEWAY: InjectionToken<SettingsGateway> = new InjectionToken<SettingsGateway>("WO_SETTINGS_GATEWAY");
