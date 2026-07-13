import { UserTenantPhase } from "@opencrane/state/tenant/adapter";

/**
 * PrimeNG `Tag` severity tokens.
 *
 * Mirrors the `severity` input union of PrimeNG's `p-tag`; the phase badge maps a
 * {@link UserTenantPhase} onto one of these via `_UserTenantPhaseSeverity`.
 */
export type UserTenantTagSeverity = "success" | "secondary" | "info" | "warn" | "danger" | "contrast";

/**
 * A pre-formatted row in the customer-admin UserTenant table.
 *
 * The console derives an array of these with a `computed` so the template renders
 * ready-made strings (ingress host fallback) and reads the enum `phase` directly,
 * rather than calling formatting helpers on every change-detection pass. `phase`
 * stays as the enum so the phase-badge maps it itself, and `suspended` drives
 * which row action (suspend vs resume) is offered.
 */
export interface UserTenantRow
{
	/** Stable UserTenant identifier (the suspend/resume action key). */
	name: string;

	/** Owner email, or an em dash when unknown. */
	email: string;

	/** Public ingress host the pod is served on, or an em dash when unassigned. */
	ingressHost: string;

	/** Observed phase, or undefined when no status is reported yet. */
	phase: UserTenantPhase | undefined;

	/** Whether the pod is currently suspended (selects the row action). */
	suspended: boolean;
}
