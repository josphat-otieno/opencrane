import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/** Small mono bordered chip tinted with a scope/status colour. */
@Component({
	selector: "wo-scope-chip",
	standalone: true,
	templateUrl: "./scope-chip.component.html",
	styleUrl: "./scope-chip.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScopeChipComponent
{
	/** Chip text. */
	public readonly label = input.required<string>();

	/** Chip accent colour. */
	public readonly color = input.required<string>();

	/** Render a border around the chip. */
	public readonly bordered = input<boolean>(true);
}
