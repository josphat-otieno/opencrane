import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from "@angular/core";
import type { Signal } from "@angular/core";
import { Router } from "@angular/router";

import { SessionStore } from "@opencrane/state/core";
import { CONVERSATION_REPLAY_GATEWAY, CONVERSATION_SUBMISSION_GATEWAY, ConversationSubmissionFailures, ConversationSubmissionUnavailableReasons, __CreateEmptyConversationReplayView } from "@opencrane/state/conversation/adapter";
import type { ConversationMessageView, ConversationReplayView, ConversationSubmissionAvailability } from "@opencrane/state/conversation/adapter";

import { ConversationPanelKinds } from "../conversation.types.js";
import { ConversationComposerComponent } from "../conversation-composer/conversation-composer.component.js";
import { MessageItemComponent } from "../message-item/message-item.component.js";
import { ConversationSupportPanelComponent } from "../support-panel/conversation-support-panel.component.js";

/** Initial conversation surface shown before messaging commands are connected. */
@Component({
	selector: "wo-conversation-view",
	standalone: true,
	imports: [ConversationComposerComponent, MessageItemComponent, ConversationSupportPanelComponent],
	templateUrl: "./conversation-view.component.html",
	styleUrl: "./conversation-view.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationViewComponent
{
	/** Signed-in identity used only for display text. */
	private readonly _session = inject(SessionStore);

	/** Canonical replay gateway for the signed-in participant. */
	private readonly _replayGateway = inject(CONVERSATION_REPLAY_GATEWAY);

	/** Prompt-submission gateway for the signed-in participant. */
	private readonly _submissionGateway = inject(CONVERSATION_SUBMISSION_GATEWAY);

	/** Router used only after the server resolves a canonical thread id. */
	private readonly _router = inject(Router);

	/** Opaque server-issued route identifier; absent for a new conversation. */
	public readonly threadId = input<string>();

	/** Resource-backed canonical replay for the selected route thread. */
	private readonly _replay = resource({
		params: this._replayParams.bind(this),
		loader: this._loadReplay.bind(this)
	});

	/** Canonical, display-safe messages reduced from replay events. */
	public readonly messages: Signal<readonly ConversationMessageView[]> = computed((): readonly ConversationMessageView[] =>
	{
		return this._replay.hasValue() ? this._replay.value().messages : [];
	});

	/** Read-only companion panel selected within the conversation view. */
	public readonly activePanel = signal<ConversationPanelKinds>(ConversationPanelKinds.None);

	/** Whether a submit request is unresolved. */
	public readonly submissionPending = signal<boolean>(false);

	/** User-visible submission failure. */
	public readonly submissionError = signal<string | null>(null);

	/** Panel kinds exposed to the template without string literals. */
	public readonly panelKinds = ConversationPanelKinds;

	/** Header title that does not expose opaque identifiers as user-facing labels. */
	public readonly title = computed((): string => this.threadId() ? "Conversation" : "New conversation");

	/** Friendly signed-in greeting. */
	public readonly displayName = computed((): string => this._session.displayName() ?? "there");

	/** Whether the selected canonical replay is loading. */
	public readonly replayLoading = computed((): boolean => this.threadId() !== undefined && this._replay.isLoading());

	/** Whether the selected canonical replay failed in a retryable way. */
	public readonly replayError = computed((): boolean => this.threadId() !== undefined && this._replay.error() !== undefined);

	/** Whether the selected canonical replay loaded but has no displayable rows. */
	public readonly replayEmpty = computed((): boolean => this.threadId() !== undefined && !this.replayLoading() && !this.replayError() && this.messages().length === 0);

	/** Submission availability for the currently selected route. */
	public readonly submissionAvailability = computed(this._submissionAvailability.bind(this));

	/** Composer disabled reason, or null when submission is available. */
	public readonly composerDisabledReason = computed(this._composerDisabledReason.bind(this));

	/** Compact route state shown beside the heading. */
	public readonly badge = computed(this._badge.bind(this));

	/** Retry the current canonical replay request. */
	public retryReplay(): void
	{
		this._replay.reload();
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
				await this._router.navigate(["/conversation", result.threadId]);
				return;
			}
			if (result.runId || result.messageId) this._replay.reload();
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

	/** Load route-owned replay data or return the root empty draft state. */
	private _loadReplay(context: { params: string | null }): Promise<ConversationReplayView>
	{
		if (context.params === null) return Promise.resolve(__CreateEmptyConversationReplayView(null));
		return this._replayGateway.read(context.params);
	}

	/** Select the route thread as the resource key without exposing it as a label. */
	private _replayParams(): string | null
	{
		return this.threadId() ?? null;
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
		return this.composerDisabledReason() === null ? "Ready" : "Read only";
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
