import { ChangeDetectionStrategy, Component } from "@angular/core";

import { HarvestChannel, SCOPE_COLORS, ScopeLevel } from "@opencrane/core";
import { ScopeChipComponent, SectionHeadingComponent } from "@opencrane/elements/ui";

/** Harvest Channels settings section. */
@Component({
	selector: "wo-channels-section",
	standalone: true,
	imports: [SectionHeadingComponent, ScopeChipComponent],
	templateUrl: "./channels-section.component.html",
	styleUrl: "./channels-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChannelsSectionComponent
{
	/**
	 * Harvest channel rows. Fixture-backed: harvest connectors are a Cognee
	 * concern with no endpoint in the pinned OpenCrane opencrane-ui contract, so
	 * unlike the other sections this one has no live gateway to read from yet.
	 * Migrate to {@link SETTINGS_GATEWAY} once a connectors endpoint exists.
	 */
	/** Harvest channel rows — populated from the live gateway once available. */
	public readonly channels: HarvestChannel[] = [];

	/** Scope accent colour lookup. */
	public scopeColor(scope: ScopeLevel): string
	{
		return SCOPE_COLORS[scope];
	}

	/** Status colour for a channel. */
	public statusColor(channel: HarvestChannel): string
	{
		switch (channel.status)
		{
			case "healthy": return "#5A8A5A";
			case "syncing": return "#4A6B8A";
			default: return "#C84B31";
		}
	}
}
