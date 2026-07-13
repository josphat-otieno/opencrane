import { ChangeDetectionStrategy, Component, input, linkedSignal } from "@angular/core";

/** Collapsible section with an uppercase header and rotating chevron. */
@Component({
	selector: "wo-collapsible-section",
	standalone: true,
	templateUrl: "./collapsible-section.component.html",
	styleUrl: "./collapsible-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollapsibleSectionComponent
{
	/** Uppercase section title. */
	public readonly title = input.required<string>();

	/** Whether the section starts open. */
	public readonly defaultOpen = input<boolean>(true);

	/** Visual variant: "panel" (bordered rows) or "rail" (dark sidebar). */
	public readonly variant = input<string>("panel");

	/** Open state, seeded from defaultOpen and toggled locally thereafter. */
	public readonly open = linkedSignal<boolean>(() => this.defaultOpen());

	/** Toggles the section open/closed. */
	public toggle(): void
	{
		this.open.update(function flip(current: boolean): boolean { return !current; });
	}
}
