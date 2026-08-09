import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource, signal } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";

import { SessionStore } from "@opencrane/state/core";
import { CONVERSATION_HISTORY_GATEWAY } from "@opencrane/state/conversation/adapter";
import type { ConversationHistoryEntryView } from "@opencrane/state/conversation/adapter";

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

	/** Canonical conversation history reader for the signed-in user. */
	private readonly _historyGateway = inject(CONVERSATION_HISTORY_GATEWAY);

	/** Resource-backed workspace history. */
	private readonly _history = resource({
		loader: this._loadHistory.bind(this)
	});

	/** Recent canonical conversation entries for the persistent rail. */
	public readonly historyEntries: Signal<readonly ConversationHistoryEntryView[]> = computed((): readonly ConversationHistoryEntryView[] =>
	{
		return this._history.hasValue() ? this._history.value() : [];
	});

	/** Whether the history rail is loading. */
	public readonly historyLoading = computed((): boolean => this._history.isLoading());

	/** Whether the history rail has a retryable read failure. */
	public readonly historyError = computed((): boolean => this._history.error() !== undefined);

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

	/** Retry the parent-owned conversation history reader. */
	public retryHistory(): void
	{
		this._history.reload();
	}

	/** Load recent canonical history entries from the state gateway. */
	private _loadHistory(): Promise<readonly ConversationHistoryEntryView[]>
	{
		return this._historyGateway.listRecent();
	}
}
