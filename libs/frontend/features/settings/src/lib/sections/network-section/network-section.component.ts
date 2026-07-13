import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource } from "@angular/core";

import { EgressDomain } from "@opencrane/core";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { SectionHeadingComponent, SettingsRowComponent } from "@opencrane/elements/ui";
import { _settledValue } from "../../resource.util";

/** Network & Egress settings section. */
@Component({
	selector: "wo-network-section",
	standalone: true,
	imports: [SectionHeadingComponent, SettingsRowComponent],
	templateUrl: "./network-section.component.html",
	styleUrl: "./network-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NetworkSectionComponent
{
	/** Active settings data source (mock by default; live OpenCrane when bound). */
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Egress allowlist, flattened from the cluster network policies. */
	private readonly _domains = resource({
		loader: (): Promise<EgressDomain[]> => this._gateway.getEgressDomains()
	});

	/** Egress allowlist rows (empty until the gateway resolves). */
	public readonly domains: Signal<EgressDomain[]> = computed((): EgressDomain[] =>
	{
		return _settledValue(this._domains) ?? [];
	});
}
