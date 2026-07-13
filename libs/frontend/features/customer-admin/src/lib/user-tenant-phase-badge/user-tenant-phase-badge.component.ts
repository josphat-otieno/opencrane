import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { TagModule } from "primeng/tag";

import { UserTenantPhase } from "@opencrane/state/tenant/adapter";
import { UserTenantTagSeverity } from "../customer-admin.types";
import { _UserTenantPhaseLabel, _UserTenantPhaseSeverity } from "../customer-admin.util";

/**
 * Phase badge for a UserTenant, rendered as a PrimeNG `Tag`.
 *
 * Enum-first: the `phase` input is mapped to a `Tag` severity and label by the
 * pure `_UserTenantPhaseSeverity` / `_UserTenantPhaseLabel` helpers (a `switch`,
 * no magic strings), promoted to `computed` so the mapping is not re-run on every
 * change detection. Used by the customer-admin console table.
 */
@Component({
	selector: "wo-user-tenant-phase-badge",
	standalone: true,
	imports: [TagModule],
	templateUrl: "./user-tenant-phase-badge.component.html",
	styleUrl: "./user-tenant-phase-badge.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserTenantPhaseBadgeComponent
{
	/** Observed phase; undefined renders a neutral "Unknown" badge. */
	public readonly phase = input<UserTenantPhase | undefined>(undefined);

	/** PrimeNG `Tag` severity for the current phase (memoised). */
	public readonly severity = computed<UserTenantTagSeverity>(() => _UserTenantPhaseSeverity(this.phase()));

	/** Title-case label for the current phase (memoised). */
	public readonly label = computed<string>(() => _UserTenantPhaseLabel(this.phase()));
}
