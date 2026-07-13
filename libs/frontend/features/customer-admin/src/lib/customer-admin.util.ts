import { UserTenant, UserTenantPhase } from "@opencrane/state/tenant/adapter";

import { UserTenantRow, UserTenantTagSeverity } from "./customer-admin.types";

/**
 * Map a UserTenant lifecycle phase to a PrimeNG `Tag` severity.
 *
 * Enum-first: a `switch` over {@link UserTenantPhase} (no magic strings) so the
 * phase badge colour stays in lock-step with the read model — pending ⇒ info,
 * running ⇒ success, suspended ⇒ warn, failed ⇒ danger. An unmodelled or absent
 * phase falls back to a neutral `secondary` tag.
 *
 * @param phase - The observed phase, or undefined when no status is reported.
 */
export function _UserTenantPhaseSeverity(phase: UserTenantPhase | undefined): UserTenantTagSeverity
{
	switch (phase)
	{
		case UserTenantPhase.Pending:
			return "info";
		case UserTenantPhase.Running:
			return "success";
		case UserTenantPhase.Suspended:
			return "warn";
		case UserTenantPhase.Failed:
			return "danger";
		default:
			return "secondary";
	}
}

/**
 * Human-readable label for a UserTenant phase (Title Case).
 *
 * Used as the `p-tag` value; an unknown/absent phase renders as "Unknown".
 *
 * @param phase - The observed phase, or undefined when no status is reported.
 */
export function _UserTenantPhaseLabel(phase: UserTenantPhase | undefined): string
{
	switch (phase)
	{
		case UserTenantPhase.Pending:
			return "Pending";
		case UserTenantPhase.Running:
			return "Running";
		case UserTenantPhase.Suspended:
			return "Suspended";
		case UserTenantPhase.Failed:
			return "Failed";
		default:
			return "Unknown";
	}
}

/**
 * Pre-format a UserTenant collection into console-table row view-models.
 *
 * Folds the per-row formatting (email/ingress-host fallbacks, suspended default)
 * into one pass so the console can expose it as a `computed` and the template
 * renders plain strings — no formatting helpers on the hot template path. `phase`
 * is left as the enum so the phase-badge maps it itself.
 *
 * @param tenants - The UserTenants currently held by the store.
 */
export function _ToUserTenantRows(tenants: ReadonlyArray<UserTenant>): UserTenantRow[]
{
	return tenants.map(function toRow(tenant: UserTenant): UserTenantRow
	{
		return {
			name: tenant.name,
			email: tenant.email && tenant.email.length > 0 ? tenant.email : "—",
			ingressHost: tenant.ingressHost && tenant.ingressHost.length > 0 ? tenant.ingressHost : "—",
			phase: tenant.phase,
			suspended: tenant.suspended ?? tenant.phase === UserTenantPhase.Suspended
		};
	});
}
