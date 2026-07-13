import { ChangeDetectionStrategy, Component, signal } from "@angular/core";

/** "Save changes" button with a transient saved confirmation state. */
@Component({
	selector: "wo-save-button",
	standalone: true,
	templateUrl: "./save-button.component.html",
	styleUrl: "./save-button.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SaveButtonComponent
{
	/** Whether the saved confirmation is showing. */
	public readonly saved = signal<boolean>(false);

	/** Shows the saved state for two seconds. */
	public save(): void
	{
		this.saved.set(true);
		setTimeout(() =>
		{
			this.saved.set(false);
		}, 2000);
	}
}
