import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource, signal } from "@angular/core";

import { CogneeDataset, SCOPE_COLORS, SEARCH_MODES, ScopeLevel, _ToggleId } from "@opencrane/core";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { AwarenessContractInfo, SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { SaveButtonComponent, ScopeChipComponent, SectionHeadingComponent, SettingsRowComponent } from "@opencrane/elements/ui";
import { ToggleFieldComponent } from "../../components/toggle-field/toggle-field.component";
import { _settledValue } from "../../resource.util";

/** Awareness Contract settings section: Cognee scope datasets + retrieval. */
@Component({
	selector: "wo-awareness-section",
	standalone: true,
	imports: [SectionHeadingComponent, SettingsRowComponent, SaveButtonComponent, ToggleFieldComponent, ScopeChipComponent],
	templateUrl: "./awareness-section.component.html",
	styleUrl: "./awareness-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AwarenessSectionComponent
{
	/** Active settings data source (mock by default; live OpenCrane when bound). */
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Active pod/tenant name, resolved at the state level (live, or demo pod in mock/offline dev). */
	private readonly _tenant: Signal<string | undefined> = inject(ActiveTenantStore).tenant;

	/** Effective awareness contract for the active pod, re-fetched when the tenant changes. */
	private readonly _contract = resource({
		params: (): string | undefined => this._tenant(),
		loader: ({ params }): Promise<AwarenessContractInfo> => this._gateway.getAwarenessContract(params)
	});

	/** Resolved contract version (e.g. `v2.3.1`), or empty until the gateway resolves. */
	public readonly contractVersion: Signal<string> = computed((): string =>
	{
		return _settledValue(this._contract)?.contractVersion ?? "";
	});

	/** Editable copy of the datasets — populated from the live gateway once available. */
	public readonly datasets = signal<CogneeDataset[]>([]);

	/** Ids of expanded dataset rows. */
	public readonly expanded = signal<string[]>([]);

	/** Search mode keys in display order. */
	public readonly searchModeKeys: string[] = Object.keys(SEARCH_MODES);

	/** Search mode metadata lookup. */
	public readonly searchModes = SEARCH_MODES;

	/** Fallback behaviour options. */
	public readonly fallbackOptions: string[] = ["Proceed without context", "Pause and warn", "Abort task"];

	/** Scope accent colour lookup. */
	public scopeColor(scope: ScopeLevel): string
	{
		return SCOPE_COLORS[scope];
	}

	/** Whether a dataset row is expanded. */
	public isExpanded(id: string): boolean
	{
		return this.expanded().includes(id);
	}

	/** Toggles a dataset row expansion. */
	public toggleExpanded(id: string): void
	{
		this.expanded.update(function toggle(current: string[]): string[] { return _ToggleId(current, id); });
	}

	/** Toggles a search mode on a dataset. */
	public toggleSearchMode(id: string, mode: string, on: boolean): void
	{
		this.datasets.update(function apply(current: CogneeDataset[]): CogneeDataset[]
		{
			return current.map(function patch(dataset: CogneeDataset): CogneeDataset
			{
				if (dataset.id !== id)
				{
					return dataset;
				}
				const searchModes = on
					? [...dataset.searchModes, mode]
					: dataset.searchModes.filter(function keep(value: string): boolean { return value !== mode; });
				return { ...dataset, searchModes };
			});
		});
	}

	/** Cognify status colour for a dataset. */
	public cognifyColor(dataset: CogneeDataset): string
	{
		switch (dataset.cognifyStatus)
		{
			case "completed": return "#5A8A5A";
			case "running": return "#4A6B8A";
			default: return "#C84B31";
		}
	}
}
