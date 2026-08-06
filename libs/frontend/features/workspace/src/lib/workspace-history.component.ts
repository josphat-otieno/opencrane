import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

import { WorkspaceConversationHistoryEntryView } from "./workspace-history.types.js";

/** Read-only workspace navigation populated by a future canonical thread reader. */
@Component({
	selector: "wo-workspace-history",
	standalone: true,
	imports: [RouterLink, RouterLinkActive],
	templateUrl: "./workspace-history.component.html",
	styleUrl: "./workspace-history.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspaceHistoryComponent
{
	/** Canonical thread summaries safe to expose in workspace navigation. */
	public readonly entries = input<readonly WorkspaceConversationHistoryEntryView[]>([]);
}
