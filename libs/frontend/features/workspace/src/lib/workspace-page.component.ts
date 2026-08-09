import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, resource, signal } from "@angular/core";
import type { Signal } from "@angular/core";
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

	/** Component lifetime hook used to release routed-output subscriptions. */
	private readonly _destroyRef = inject(DestroyRef);

	/** Canonical conversation history reader for the signed-in user. */
	private readonly _historyGateway = inject(CONVERSATION_HISTORY_GATEWAY);

	/** Resource-backed workspace history. */
	private readonly _history = resource({
		loader: this._loadHistory.bind(this)
	});

	/** Recent canonical conversation entries for the persistent rail. */
	public readonly historyEntries: Signal<readonly ConversationHistoryEntryView[]> = computed(this._historyEntries.bind(this));

	/** Whether the history rail is loading. */
	public readonly historyLoading = computed(this._historyLoading.bind(this));

	/** Whether the history rail has a retryable read failure. */
	public readonly historyError = computed(this._historyError.bind(this));

	/** Display name shown in the persistent account footer. */
	public readonly userName = computed(this._userName.bind(this));

	/** Initials used by the compact account avatar. */
	public readonly userInitials = computed(this._userInitials.bind(this));

	/** Whether the logout request is currently unresolved. */
	public readonly logoutPending = signal<boolean>(false);

	/** User-visible failure state for a logout request that can be retried. */
	public readonly logoutError = signal<boolean>(false);

	/** Active routed-component history refresh subscription. */
	private _historyRefreshSubscription: _RouteOutputSubscription | null = null;

	/** Register cleanup for routed output subscriptions. */
	public constructor()
	{
		this._destroyRef.onDestroy(this._clearHistoryRefreshSubscription.bind(this));
	}

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

	/** Subscribe to routed feature refresh output when it exists. */
	public attachRoutedFeature(component: unknown): void
	{
		this._clearHistoryRefreshSubscription();
		if (!_hasHistoryRefreshOutput(component)) return;
		this._historyRefreshSubscription = component.historyRefreshRequested.subscribe(this.retryHistory.bind(this));
	}

	/** Release the current routed feature refresh output when the route deactivates. */
	public detachRoutedFeature(): void
	{
		this._clearHistoryRefreshSubscription();
	}

	/** Load recent canonical history entries from the state gateway. */
	private _loadHistory(): Promise<readonly ConversationHistoryEntryView[]>
	{
		return this._historyGateway.listRecent();
	}

	/** Read recent entries from the history resource. */
	private _historyEntries(): readonly ConversationHistoryEntryView[]
	{
		return this._history.hasValue() ? this._history.value() : [];
	}

	/** Read loading state from the history resource. */
	private _historyLoading(): boolean
	{
		return this._history.isLoading();
	}

	/** Read retryable failure state from the history resource. */
	private _historyError(): boolean
	{
		return this._history.error() !== undefined;
	}

	/** Read display name with a stable fallback. */
	private _userName(): string
	{
		return this._session.displayName() ?? "Signed-in user";
	}

	/** Convert display name into compact account initials. */
	private _userInitials(): string
	{
		const parts = this.userName().split(" ").filter(Boolean);
		return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
	}

	/** Release the previous routed feature subscription. */
	private _clearHistoryRefreshSubscription(): void
	{
		this._historyRefreshSubscription?.unsubscribe();
		this._historyRefreshSubscription = null;
	}
}

/** Minimal subscription contract used by Angular output refs. */
interface _RouteOutputSubscription
{
	/** Release this subscription. */
	unsubscribe(): void;
}

/** Routed component that can ask the workspace shell to refresh history. */
interface _HistoryRefreshEmitter
{
	/** Output-like refresh signal exposed by the routed feature. */
	readonly historyRefreshRequested: _HistoryRefreshOutput;
}

/** Output-like object exposed by Angular output refs. */
interface _HistoryRefreshOutput
{
	/**
	 * Subscribe to history refresh requests.
	 *
	 * @param callback - Refresh callback owned by the workspace shell.
	 * @returns Subscription that releases the routed output listener.
	 */
	subscribe(callback: _HistoryRefreshCallback): _RouteOutputSubscription;
}

/** Callback invoked when routed history should refresh. */
interface _HistoryRefreshCallback
{
	/** Refresh the parent-owned history resource. */
	(): void;
}

/** Detect the optional routed history-refresh output structurally. */
function _hasHistoryRefreshOutput(component: unknown): component is _HistoryRefreshEmitter
{
	if (typeof component !== "object" || component === null) return false;
	if (!("historyRefreshRequested" in component)) return false;
	const output = component.historyRefreshRequested;
	return typeof output === "object" && output !== null && "subscribe" in output && typeof output.subscribe === "function";
}
