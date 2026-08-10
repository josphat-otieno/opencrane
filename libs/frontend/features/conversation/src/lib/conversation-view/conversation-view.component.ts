import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from "@angular/core";
import type { Signal } from "@angular/core";
import { Router } from "@angular/router";

import { APPROVAL_DECISION_GATEWAY } from "@opencrane/state/approvals/adapter";
import { SessionStore } from "@opencrane/state/core";
import { CONVERSATION_PROGRESS_GATEWAY, CONVERSATION_SUBMISSION_GATEWAY, ConversationProgressController, ConversationProgressStates, ConversationSubmissionFailures, ConversationSubmissionUnavailableReasons, __CreateIdleConversationProgressSnapshot } from "@opencrane/state/conversation/adapter";
import type { ConversationCitationView, ConversationFileView, ConversationMemoryReferenceView, ConversationMessageView, ConversationProgressSnapshot, ConversationSubmissionAvailability } from "@opencrane/state/conversation/adapter";

import { ConversationPanelKinds } from "../conversation.types.js";
import { ConversationApprovalCardComponent } from "../components/approval-card/conversation-approval-card.component.js";
import { ConversationComposerComponent } from "../conversation-composer/conversation-composer.component.js";
import { ConversationProgressStatusComponent } from "../components/progress-status/conversation-progress-status.component.js";
import { MessageItemComponent } from "../message-item/message-item.component.js";
import { ConversationSupportPanelComponent } from "../support-panel/conversation-support-panel.component.js";
import { ConversationApprovalController } from "./conversation-approval-controller.js";

/** Initial conversation surface shown before messaging commands are connected. */
@Component({
	selector: "wo-conversation-view",
	standalone: true,
	imports: [ConversationApprovalCardComponent, ConversationComposerComponent, ConversationProgressStatusComponent, MessageItemComponent, ConversationSupportPanelComponent],
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

	/** Feature-local approval controller for the selected route/run. */
	private readonly _approvalController = new ConversationApprovalController({ gateway: inject(APPROVAL_DECISION_GATEWAY), onDecisionRecorded: this._refreshAfterApprovalDecision.bind(this) });

	/** Current display-safe approvals for the selected run. */
	public readonly approvalCards = this._approvalController.cards;

	/** Whether approval list loading is unresolved. */
	public readonly approvalsLoading = this._approvalController.loading;

	/** User-visible approval list failure. */
	public readonly approvalsError = this._approvalController.error;

	/** Canonical, display-safe messages reduced from replay events. */
	public readonly messages: Signal<readonly ConversationMessageView[]> = computed(this._messages.bind(this));

	/** Run-level display-safe citations reduced from replay events. */
	public readonly citations: Signal<readonly ConversationCitationView[]> = computed(this._citations.bind(this));

	/** Run-level display-safe artifact metadata reduced from replay events. */
	public readonly files: Signal<readonly ConversationFileView[]> = computed(this._files.bind(this));

	/** Run-level display-safe memory references reduced from replay events. */
	public readonly memoryReferences: Signal<readonly ConversationMemoryReferenceView[]> = computed(this._memoryReferences.bind(this));

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

	/** Retry the pending approval list for the current run. */
	public retryApprovals(): void
	{
		this._approvalController.retryLoad(this.progress().runId);
	}

	/** Approve one exact server-owned action. */
	public approveApproval(approvalId: string): void
	{
		this._approvalController.approve(approvalId);
	}

	/** Deny one exact server-owned action. */
	public denyApproval(approvalId: string): void
	{
		this._approvalController.deny(approvalId);
	}

	/** Retry the last failed decision for one approval. */
	public retryApprovalDecision(approvalId: string): void
	{
		this._approvalController.retryDecision(approvalId);
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
		this._approvalController.syncForProgress(snapshot);
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
			this._approvalController.clear();
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

	/** Read run-level citations from the latest progress snapshot. */
	private _citations(): readonly ConversationCitationView[]
	{
		return this.progress().replay.citations;
	}

	/** Read run-level artifact metadata from the latest progress snapshot. */
	private _files(): readonly ConversationFileView[]
	{
		return this.progress().replay.files;
	}

	/** Read run-level memory references from the latest progress snapshot. */
	private _memoryReferences(): readonly ConversationMemoryReferenceView[]
	{
		return this.progress().replay.memoryReferences;
	}

	/** Refresh server-owned replay/status after an approval decision attempt. */
	private _refreshAfterApprovalDecision(): void
	{
		this._progressController.retry();
		this.historyRefreshRequested.emit();
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
	return _SUBMISSION_FAILURE_TEXT[failure];
}

/** Convert progress state into compact header badge copy. */
function _badgeForProgress(state: ConversationProgressStates, submissionAvailable: boolean): string
{
	if (state === ConversationProgressStates.Idle && !submissionAvailable) return "Read only";
	return _PROGRESS_BADGES[state];
}

/** Explain progress state without exposing runtime internals. */
function _progressDetail(snapshot: ConversationProgressSnapshot): string | null
{
	return _PROGRESS_DETAILS[snapshot.state];
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
	return _EMPTY_TITLES[state];
}

/** Exhaustive user-facing mapping for submission failures. */
const _SUBMISSION_FAILURE_TEXT: Record<ConversationSubmissionFailures, string> = {
	[ConversationSubmissionFailures.BlankPrompt]: "Enter a message before sending.",
	[ConversationSubmissionFailures.ThreadMessageContractMissing]: "Message submission is not available yet.",
	[ConversationSubmissionFailures.Unknown]: "OpenCrane could not submit the message. Try again."
};

/** Exhaustive badge mapping for route progress states. */
const _PROGRESS_BADGES: Record<ConversationProgressStates, string> = {
	[ConversationProgressStates.Idle]: "Ready",
	[ConversationProgressStates.LoadingReplay]: "Loading",
	[ConversationProgressStates.RunAdmitted]: "Waiting",
	[ConversationProgressStates.Running]: "Running",
	[ConversationProgressStates.WaitingForApproval]: "Approval",
	[ConversationProgressStates.Refreshing]: "Loading",
	[ConversationProgressStates.Reconnecting]: "Running",
	[ConversationProgressStates.Completed]: "Completed",
	[ConversationProgressStates.Cancelled]: "Cancelled",
	[ConversationProgressStates.RefreshFailed]: "Failed",
	[ConversationProgressStates.Failed]: "Failed"
};

/** Exhaustive detail-copy mapping for route progress states. */
const _PROGRESS_DETAILS: Record<ConversationProgressStates, string | null> = {
	[ConversationProgressStates.Idle]: null,
	[ConversationProgressStates.LoadingReplay]: "Reading canonical replay events.",
	[ConversationProgressStates.RunAdmitted]: "Waiting for server-confirmed events.",
	[ConversationProgressStates.Running]: "Reading new output from OpenCrane.",
	[ConversationProgressStates.WaitingForApproval]: "Review the pending action before OpenCrane continues.",
	[ConversationProgressStates.Refreshing]: "Checking for new canonical events.",
	[ConversationProgressStates.Reconnecting]: "Keeping the current messages visible.",
	[ConversationProgressStates.Completed]: "OpenCrane finished this run.",
	[ConversationProgressStates.Cancelled]: "This run was cancelled.",
	[ConversationProgressStates.RefreshFailed]: "Canonical replay is temporarily unavailable.",
	[ConversationProgressStates.Failed]: "OpenCrane could not complete this run."
};

/** Exhaustive empty-state title mapping for route progress states. */
const _EMPTY_TITLES: Record<ConversationProgressStates, string> = {
	[ConversationProgressStates.Idle]: "No replay events yet",
	[ConversationProgressStates.LoadingReplay]: "Loading conversation",
	[ConversationProgressStates.RunAdmitted]: "Waiting for OpenCrane",
	[ConversationProgressStates.Running]: "Running",
	[ConversationProgressStates.WaitingForApproval]: "Waiting for approval",
	[ConversationProgressStates.Refreshing]: "Refreshing",
	[ConversationProgressStates.Reconnecting]: "Reconnecting",
	[ConversationProgressStates.Completed]: "Completed",
	[ConversationProgressStates.Cancelled]: "Cancelled",
	[ConversationProgressStates.RefreshFailed]: "Conversation could not be loaded",
	[ConversationProgressStates.Failed]: "Failed"
};
