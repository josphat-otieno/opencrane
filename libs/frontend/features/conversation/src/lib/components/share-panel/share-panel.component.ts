import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";

import { ShareTarget, Teammate, _ToggleId } from "@opencrane/core";
import { AvatarCircleComponent } from "@opencrane/elements/ui";

/** Share popover: invite teammates or share the canvas to another session. */
@Component({
	selector: "wo-share-panel",
	standalone: true,
	imports: [AvatarCircleComponent],
	templateUrl: "./share-panel.component.html",
	styleUrl: "./share-panel.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SharePanelComponent
{
	/** Title of the session being shared. */
	public readonly sessionTitle = input.required<string>();

	/** Emits when the panel should close. */
	public readonly closed = output<void>();

	/** Active tab ("invite" | "share"). */
	public readonly tab = signal<string>("invite");

	/** Teammate search query. */
	public readonly query = signal<string>("");

	/** Selected teammate ids. */
	public readonly selected = signal<string[]>([]);

	/** Selected share-target session ids. */
	public readonly selectedTargets = signal<string[]>([]);

	/** Whether the copy-link confirmation is showing. */
	public readonly copied = signal<boolean>(false);

	/** Share targets — populated from the live gateway once available. */
	public readonly targets: ShareTarget[] = [];

	/** Teammates filtered by the search query — empty until live gateway lands. */
	public readonly filteredTeammates = computed<Teammate[]>(() => []);

	/** Resolves a teammate by id — returns undefined until live gateway lands. */
	public teammate(_id: string): Teammate | undefined { return undefined; }

	/** Toggles a teammate selection. */
	public toggleTeammate(id: string): void
	{
		this.selected.update(function toggle(current: string[]): string[] { return _ToggleId(current, id); });
	}

	/** Toggles a share-target selection. */
	public toggleTarget(id: string): void
	{
		this.selectedTargets.update(function toggle(current: string[]): string[] { return _ToggleId(current, id); });
	}

	/** Shows the copied confirmation for two seconds. */
	public copyLink(): void
	{
		this.copied.set(true);
		setTimeout(this._resetCopied.bind(this), 2000);
	}

	private _resetCopied(): void { this.copied.set(false); }
}
