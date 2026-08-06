import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";

import { SessionStore } from "@opencrane/state/core";

import { WorkspaceHistoryComponent } from "./workspace-history.component.js";

/** Persistent authenticated workspace shell. */
@Component({
	selector: "wo-workspace-page",
	standalone: true,
	imports: [RouterLink, RouterLinkActive, RouterOutlet, WorkspaceHistoryComponent],
	templateUrl: "./workspace-page.component.html",
	styleUrl: "./workspace-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspacePageComponent
{
	/** Signed-in identity used only for display and logout. */
	private readonly _session = inject(SessionStore);

	/** Display name shown in the persistent account footer. */
	public readonly userName = computed((): string => this._session.displayName() ?? "Signed-in user");

	/** Initials used by the compact account avatar. */
	public readonly userInitials = computed((): string =>
	{
		const parts = this.userName().split(" ").filter(Boolean);
		return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
	});

	/** Whether the logout request is currently unresolved. */
	public readonly logoutPending = signal<boolean>(false);

	/** User-visible failure state for a logout request that can be retried. */
	public readonly logoutError = signal<boolean>(false);

	/** End the current browser session. */
	public async logout(): Promise<void>
	{
		if (this.logoutPending())
		{
			return;
		}

		this.logoutPending.set(true);
		this.logoutError.set(false);
		try
		{
			await this._session.logout();
		}
		catch
		{
			this.logoutError.set(true);
		}
		finally
		{
			this.logoutPending.set(false);
		}
	}
}
