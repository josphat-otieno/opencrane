import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource } from "@angular/core";

import { DatasetAccess, SCOPE_COLORS, ScopeLevel } from "@opencrane/core";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ScopeChipComponent, SectionHeadingComponent } from "@opencrane/elements/ui";
import { _settledValue } from "../../resource.util";

/** Access & Datasets settings section. */
@Component({
	selector: "wo-access-section",
	standalone: true,
	imports: [SectionHeadingComponent, ScopeChipComponent],
	templateUrl: "./access-section.component.html",
	styleUrl: "./access-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccessSectionComponent
{
	/** Active settings data source (mock by default; live OpenCrane when bound). */
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Active pod/tenant name, resolved at the state level (live, or demo pod in mock/offline dev). */
	private readonly _tenant: Signal<string | undefined> = inject(ActiveTenantStore).tenant;

	/** Dataset memberships for the active pod, re-fetched when the tenant changes. */
	private readonly _memberships = resource({
		params: (): string | undefined => this._tenant(),
		loader: ({ params }): Promise<DatasetAccess[]> => this._gateway.getDatasetAccess(params)
	});

	/** Dataset membership rows (empty until the gateway resolves). */
	public readonly memberships: Signal<DatasetAccess[]> = computed((): DatasetAccess[] =>
	{
		return _settledValue(this._memberships) ?? [];
	});

	/** Scope accent colour lookup. */
	public scopeColor(scope: ScopeLevel): string
	{
		return SCOPE_COLORS[scope];
	}
}
