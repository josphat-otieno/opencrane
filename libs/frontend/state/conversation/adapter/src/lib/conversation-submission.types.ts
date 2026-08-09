/** Submission phases represented by the conversation UI. */
export enum ConversationSubmissionStates
{
	/** No submission is in progress. */
	Idle = "idle",
	/** The browser asked the control plane to durably record a user message. */
	SubmittingMessage = "submitting_message",
	/** A recorded message is being admitted as a run. */
	AdmittingRun = "admitting_run",
	/** A new run was accepted. */
	Accepted = "accepted",
	/** A retry returned the already accepted run. */
	Idempotent = "idempotent",
	/** The submission could not complete. */
	Failed = "failed"
}

/** Known reasons a prompt cannot currently be submitted. */
export enum ConversationSubmissionUnavailableReasons
{
	/** The public thread/message creation contract is not generated yet. */
	ThreadMessageContractMissing = "thread_message_contract_missing"
}

/** Browser-safe failure categories for prompt submission. */
export enum ConversationSubmissionFailures
{
	/** Prompt text was empty after trimming. */
	BlankPrompt = "blank_prompt",
	/** The required public thread/message contract is missing. */
	ThreadMessageContractMissing = "thread_message_contract_missing",
	/** The generated client returned an unexpected failure. */
	Unknown = "unknown"
}

/** Draft prompt supplied by a conversation composer. */
export interface ConversationDraft
{
	/** Existing thread id for a follow-up, or null when starting from the root route. */
	readonly threadId: string | null;
	/** User-authored prompt text. */
	readonly prompt: string;
}

/** Synchronous availability state for the current route's composer. */
export interface ConversationSubmissionAvailability
{
	/** Whether the feature may attempt submission. */
	readonly canSubmit: boolean;
	/** User-safe reason when submission is unavailable. */
	readonly reason?: ConversationSubmissionUnavailableReasons;
}

/** Result returned after a prompt submission attempt. */
export interface ConversationSubmitResult
{
	/** Submission state after the attempt. */
	readonly state: ConversationSubmissionStates;
	/** Canonical thread id when the control plane records or resolves one. */
	readonly threadId?: string;
	/** Canonical message id when the control plane records one. */
	readonly messageId?: string;
	/** Canonical run id when run admission succeeds. */
	readonly runId?: string;
	/** User-safe failure category when submission fails. */
	readonly failure?: ConversationSubmissionFailures;
	/** Whether the same user action can be retried. */
	readonly retryable: boolean;
}

/** Owns prompt/thread-message submission before run admission. */
export interface ConversationSubmissionGateway
{
	/**
	 * Report whether a prompt can be submitted for the selected route.
	 *
	 * @param threadId - Existing thread id for a follow-up, or null for a new conversation.
	 * @returns User-safe availability information.
	 */
	availability(threadId: string | null): ConversationSubmissionAvailability;

	/**
	 * Submit one user-authored prompt.
	 *
	 * @param draft - Prompt and optional existing thread.
	 * @returns Submission result.
	 */
	submit(draft: ConversationDraft): Promise<ConversationSubmitResult>;
}
