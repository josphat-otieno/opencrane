import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/** Initials avatar circle with a solid background colour. */
@Component({
	selector: "wo-avatar-circle",
	standalone: true,
	templateUrl: "./avatar-circle.component.html",
	styleUrl: "./avatar-circle.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AvatarCircleComponent
{
	/** Initials to render. */
	public readonly initials = input.required<string>();

	/** Background colour. */
	public readonly color = input.required<string>();

	/** Diameter in pixels. */
	public readonly size = input<number>(24);
}
