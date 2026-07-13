import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/** Labelled settings field row: label + hint on the left, control on the right. */
@Component({
	selector: "wo-settings-row",
	standalone: true,
	templateUrl: "./settings-row.component.html",
	styleUrl: "./settings-row.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsRowComponent
{
	/** Field label. */
	public readonly label = input.required<string>();

	/** Optional hint under the label. */
	public readonly hint = input<string | undefined>(undefined);
}
