import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

import { DEPARTMENTS, DepartmentInfo, SessionSummary } from "@opencrane/core";

/** A single session row in the sidebar rail lists; links to its session route. */
@Component({
	selector: "wo-session-row",
	standalone: true,
	imports: [RouterLink, RouterLinkActive],
	templateUrl: "./session-row.component.html",
	styleUrl: "./session-row.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionRowComponent
{
	/** Session to render. */
	public readonly session = input.required<SessionSummary>();

	/** Resolves department metadata for the session. */
	public department(): DepartmentInfo | undefined
	{
		return DEPARTMENTS[this.session().dept];
	}
}
