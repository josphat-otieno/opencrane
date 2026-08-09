import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from "@angular/core";
import type { Signal } from "@angular/core";
import { Router } from "@angular/router";

import { SessionStore } from "@opencrane/state/core";
import { CONVERSATION_PROGRESS_GATEWAY, CONVERSATION_SUBMISSION_GATEWAY, ConversationProgressController, ConversationProgressStates, ConversationSubmissionFailures, ConversationSubmissionUnavailableReasons, __CreateIdleConversationProgressSnapshot } from "@opencrane/state/conversation/adapter";
import type { ConversationMessageView, ConversationProgressSnapshot, ConversationSubmissionAvailability } from "@opencrane/state/conversation/adapter";

import { ConversationPanelKinds } from "../conversation.types.js";
import { ConversationComposerComponent } from "../conversation-composer/conversation-composer.component.js";
import { ConversationProgressStatusComponent } from "../components/progress-status/conversation-progress-status.component.js";
import { MessageItemComponent } from "../message-item/message-item.component.js";
import { ConversationSupportPanelComponent } from "../support-panel/conversation-support-panel.component.js";

/** Initial conversation surface shown before messaging commands are connected. */
@Component({
	selector: "wo-conversation-view",
	standalone: true,
	imports: [ConversationComposerComponent, ConversationProgressStatusComponent, MessageItemComponent, ConversationSupportPanelComponent],
	templateUrl: "./conversation-view.component.html",
	styleUrl: "./conversation-view.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationViewComponent
{
	/** Signed-in identity used only for display text. */
	private readonly _session = inject(SessionStore);

	/** Component lifetime hook used to stop progress polling. */
	private readonly _destroyRef = inject(DestroyRef);

	/** Bounded replay/status gateway for the signed-in participant. */
	private readonly _progressGateway = inject(CONVERSATION_PROGRESS_GATEWAY);

	/** Prompt-submission gateway for the signed-in participant. */
	private readonly _submissionGateway = inject(CONVERSATION_SUBMISSION_GATEWAY);

	/** Router used only after the server resolves a canonical thread id. */
	private readonly _router: Router = inject(Router);

	/** Opaque server-issued route identifier; absent for a new conversation. */
	public readonly threadId = input<string>();

	/** Latest owner-visible run id supplied by the workspace history route, when available. */
	public readonly runId = input<string>();

	/** Emits when the workspace shell should refresh owner-visible conversation history. */
	public readonly historyRefreshRequested = output<void>();

	/** Controller-owned progress snapshot for the selected route. */
	public readonly progress = signal<ConversationProgressSnapshot>(__CreateIdleConversationProgressSnapshot(null));

	/** Bounded progress controller for this route component instance. */
	private readonly _progressController = new ConversationProgressController({ gateway: this._progressGateway, onSnapshot: this._publishProgress.bind(this) });

	/** Canonical, display-safe messages reduced from replay events. */
	public readonly messages: Signal<readonly ConversationMessageView[]> = computed(this._messages.bind(this));

	/** Read-only companion panel selected within the conversation view. */
	public readonly activePanel = signal<ConversationPanelKinds>(ConversationPanelKinds.None);

	/** Whether a submit request is unresolved. */
	public readonly submissionPending = signal<boolean>(false);

	/** User-visible submission failure. */
	public readonly submissionError = signal<string | null>(null);

	/** Panel kinds exposed to the template without string literals. */
	public readonly panelKinds = ConversationPanelKinds;

	/** Header title that does not expose opaque identifiers as user-facing labels. */
	public readonly title = computed(this._title.bind(this));

	/** Friendly signed-in greeting. */
	public readonly displayName = computed(this._displayName.bind(this));

	/** Whether the selected canonical replay is loading. */
	public readonly replayLoading = computed(this._replayLoading.bind(this));

	/** Whether the selected canonical replay failed in a retryable way. */
	public readonly replayError = computed(this._replayError.bind(this));

	/** Whether the selected canonical replay loaded but has no displayable rows. */
	public readonly replayEmpty = computed(this._replayEmpty.bind(this));

	/** Submission availability for the currently selected route. */
	public readonly submissionAvailability = computed(this._submissionAvailability.bind(this));

	/** Composer disabled reason, or null when submission is available. */
	public readonly composerDisabledReason = computed(this._composerDisabledReason.bind(this));

	/** Compact route state shown beside the heading. */
	public readonly badge = computed(this._badge.bind(this));

	/** Progress state passed to the presentational status strip. */
	public readonly progressState = computed(this._progressState.bind(this));

	/** Detail copy for bounded replay/status refresh. */
	public readonly progressDetail = computed(this._progressDetail.bind(this));

	/** Whether the current progress state can be retried manually. */
	public readonly progressRetryable = computed(this._progressRetryable.bind(this));

	/** Empty-stream heading for route-owned progress states. */
	public readonly emptyTitle = computed(this._emptyTitle.bind(this));

	/** Empty-stream detail for route-owned progress states. */
	public readonly emptyDetail = computed(this._emptyDetail.bind(this));

	/** React to route-thread changes without storing cursors outside memory. */
	private readonly _routeProgressEffect = effect(this._syncRouteProgress.bind(this));

	/** Register polling cleanup for component teardown. */
	public constructor()
	{
		this._destroyRef.onDestroy(this._stopProgress.bind(this));
	}

	/** Retry the current canonical replay request. */
	public retryReplay(): void
	{
		this._progressController.retry();
	}

	/** Retry bounded progress refresh while preserving visible messages. */
	public retryProgress(): void
	{
		this._progressController.retry();
	}

	/** Submit a prompt through the state gateway when the backend contract allows it. */
	public async submitPrompt(prompt: string): Promise<void>
	{
		// 1. Ignore stale UI events while submission is unavailable or already running.
		if (this.submissionPending() || this.composerDisabledReason() !== null) return;

		// 2. Mark the local action pending before crossing the gateway boundary.
		this.submissionPending.set(true);
		this.submissionError.set(null);
		try
		{
			// 3. Delegate contract ownership to the state gateway.
			const result = await this._submissionGateway.submit({ threadId: this.threadId() ?? null, prompt });

			// 4. Reflect the gateway result without inventing browser-side thread state.
			if (result.failure) this.submissionError.set(_submissionFailureText(result.failure));
			if (result.threadId && result.threadId !== this.threadId())
			{
				if (result.runId || result.messageId) this.historyRefreshRequested.emit();
				await this._router.navigate(["/conversation", result.threadId], { queryParams: result.runId ? { runId: result.runId } : {} });
				return;
			}
			if (result.runId) this._startProgressForCurrentThread(result.runId);
			if (result.runId || result.messageId) this.historyRefreshRequested.emit();
			if (!result.runId && result.messageId) this._progressController.retry();
		}
		catch
		{
			this.submissionError.set("OpenCrane could not submit the message. Try again.");
		}
		finally
		{
			// 5. Release the composer regardless of the gateway result.
			this.submissionPending.set(false);
		}
	}

	/** Toggle one local read-only supporting panel. */
	public togglePanel(kind: ConversationPanelKinds): void
	{
		this.activePanel.update(function _toggle(current: ConversationPanelKinds): ConversationPanelKinds
		{
			return current === kind ? ConversationPanelKinds.None : kind;
		});
	}

	/** Publish controller snapshots into Angular signal state. */
	private _publishProgress(snapshot: ConversationProgressSnapshot): void
	{
		const previous = untracked(this.progress);
		this.progress.set(snapshot);
		if (_shouldRefreshHistory(previous, snapshot)) this.historyRefreshRequested.emit();
	}

	/** Restart bounded progress refresh when the route thread changes. */
	private _syncRouteProgress(): void
	{
		const threadId = this.threadId();
		if (threadId === undefined)
		{
			this._progressController.stop();
			this.progress.set(__CreateIdleConversationProgressSnapshot(null));
			return;
		}
		this._progressController.start({ threadId, runId: this.runId() ?? null });
	}

	/** Stop polling when Angular destroys the routed component. */
	private _stopProgress(): void
	{
		this._progressController.stop();
	}

	/** Start progress after a future submission gateway admits a run on this route. */
	private _startProgressForCurrentThread(runId: string): void
	{
		const threadId = this.threadId();
		if (threadId === undefined) return;
		this._progressController.start({ threadId, runId });
	}

	/** Read canonical messages from the latest progress snapshot. */
	private _messages(): readonly ConversationMessageView[]
	{
		return this.progress().replay.messages;
	}

	/** Derive a title without exposing opaque route identifiers. */
	private _title(): string
	{
		if (this.threadId()) return "Conversation";
		return "New conversation";
	}

	/** Read the signed-in display name with a friendly fallback. */
	private _displayName(): string
	{
		return this._session.displayName() ?? "there";
	}

	/** Show full-screen loading only before any replay rows are visible. */
	private _replayLoading(): boolean
	{
		return this.threadId() !== undefined && this.progress().state === ConversationProgressStates.LoadingReplay && this.messages().length === 0;
	}

	/** Show full-screen replay failure only when there is no prior display state. */
	private _replayError(): boolean
	{
		return this.threadId() !== undefined && this.progress().state === ConversationProgressStates.RefreshFailed && this.messages().length === 0;
	}

	/** Detect an existing thread with no displayable canonical rows yet. */
	private _replayEmpty(): boolean
	{
		return this.threadId() !== undefined && !this.replayLoading() && !this.replayError() && this.messages().length === 0;
	}

	/** Read submission availability for the selected opaque route. */
	private _submissionAvailability(): ConversationSubmissionAvailability
	{
		return this._submissionGateway.availability(this.threadId() ?? null);
	}

	/** Convert typed availability into the composer's disabled message. */
	private _composerDisabledReason(): string | null
	{
		const availability = this.submissionAvailability();
		if (availability.canSubmit) return null;
		return _unavailableReasonText(availability.reason, this.threadId() ?? null);
	}

	/** Derive route state from the canonical thread and submission contract state. */
	private _badge(): string
	{
		if (this.threadId() === undefined) return "Draft";
		return _badgeForProgress(this.progress().state, this.composerDisabledReason() === null);
	}

	/** Hide idle state from the persistent status strip. */
	private _progressState(): ConversationProgressStates
	{
		return this.progress().state;
	}

	/** Derive user-facing detail for non-message progress state. */
	private _progressDetail(): string | null
	{
		return _progressDetail(this.progress());
	}

	/** Report whether bounded refresh can be retried now. */
	private _progressRetryable(): boolean
	{
		return this.progress().retryable;
	}

	/** Derive empty-stream heading from bounded progress state. */
	private _emptyTitle(): string
	{
		return _emptyTitle(this.progress().state);
	}

	/** Derive empty-stream detail from bounded progress state. */
	private _emptyDetail(): string
	{
		return _progressDetail(this.progress()) ?? "This conversation does not have displayable canonical events yet.";
	}
}

/** Convert route availability into user-facing composer copy. */
function _unavailableReasonText(reason: ConversationSubmissionUnavailableReasons | undefined, threadId: string | null): string
{
	if (reason === ConversationSubmissionUnavailableReasons.ThreadMessageContractMissing)
	{
		return threadId === null ? "Starting new conversations is not available yet." : "Message submission is not available yet.";
	}
	return "Message submission is not available yet.";
}

/** Convert typed submission failures into user-facing copy. */
function _submissionFailureText(failure: ConversationSubmissionFailures): string
{
	switch (failure)
	{
		case ConversationSubmissionFailures.BlankPrompt:
			return "Enter a message before sending.";
		case ConversationSubmissionFailures.ThreadMessageContractMissing:
			return "Message submission is not available yet.";
		case ConversationSubmissionFailures.Unknown:
			return "OpenCrane could not submit the message. Try again.";
	}
	const unhandled: never = failure;
	return unhandled;
}

/** Convert progress state into compact header badge copy. */
function _badgeForProgress(state: ConversationProgressStates, submissionAvailable: boolean): string
{
	switch (state)
	{
		case ConversationProgressStates.LoadingReplay:
		case ConversationProgressStates.Refreshing:
			return "Loading";
		case ConversationProgressStates.RunAdmitted:
			return "Waiting";
		case ConversationProgressStates.Running:
		case ConversationProgressStates.Reconnecting:
			return "Running";
		case ConversationProgressStates.WaitingForApproval:
			return "Approval";
		case ConversationProgressStates.Completed:
			return "Completed";
		case ConversationProgressStates.Failed:
		case ConversationProgressStates.RefreshFailed:
			return "Failed";
		case ConversationProgressStates.Cancelled:
			return "Cancelled";
		case ConversationProgressStates.Idle:
			return submissionAvailable ? "Ready" : "Read only";
	}
	const unhandled: never = state;
	return unhandled;
}

/** Explain progress state without exposing runtime internals. */
function _progressDetail(snapshot: ConversationProgressSnapshot): string | null
{
	switch (snapshot.state)
	{
		case ConversationProgressStates.LoadingReplay:
			return "Reading canonical replay events.";
		case ConversationProgressStates.RunAdmitted:
			return "Waiting for server-confirmed events.";
		case ConversationProgressStates.Running:
			return "Reading new output from OpenCrane.";
		case ConversationProgressStates.WaitingForApproval:
			return "Review the pending action before OpenCrane continues.";
		case ConversationProgressStates.Refreshing:
			return "Checking for new canonical events.";
		case ConversationProgressStates.Reconnecting:
			return "Keeping the current messages visible.";
		case ConversationProgressStates.RefreshFailed:
			return "Canonical replay is temporarily unavailable.";
		case ConversationProgressStates.Completed:
			return "OpenCrane finished this run.";
		case ConversationProgressStates.Cancelled:
			return "This run was cancelled.";
		case ConversationProgressStates.Failed:
			return "OpenCrane could not complete this run.";
		case ConversationProgressStates.Idle:
			return null;
	}
	const unhandled: never = snapshot.state;
	return unhandled;
}

/** Decide whether progress changed enough for the workspace history rail to refresh. */
function _shouldRefreshHistory(previous: ConversationProgressSnapshot, next: ConversationProgressSnapshot): boolean
{
	if (next.runId !== null && previous.runId !== next.runId) return true;
	if (!previous.terminal && next.terminal) return true;
	return next.replay.messages.length > previous.replay.messages.length;
}

/** Convert empty-stream progress into the existing welcome heading region. */
function _emptyTitle(state: ConversationProgressStates): string
{
	switch (state)
	{
		case ConversationProgressStates.LoadingReplay:
			return "Loading conversation";
		case ConversationProgressStates.RunAdmitted:
			return "Waiting for OpenCrane";
		case ConversationProgressStates.Running:
			return "Running";
		case ConversationProgressStates.WaitingForApproval:
			return "Waiting for approval";
		case ConversationProgressStates.Refreshing:
			return "Refreshing";
		case ConversationProgressStates.Reconnecting:
			return "Reconnecting";
		case ConversationProgressStates.RefreshFailed:
			return "Conversation could not be loaded";
		case ConversationProgressStates.Completed:
			return "Completed";
		case ConversationProgressStates.Cancelled:
			return "Cancelled";
		case ConversationProgressStates.Failed:
			return "Failed";
		case ConversationProgressStates.Idle:
			return "No replay events yet";
	}
	const unhandled: never = state;
	return unhandled;
}
