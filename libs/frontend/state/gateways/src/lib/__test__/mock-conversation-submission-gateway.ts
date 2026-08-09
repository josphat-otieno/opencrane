import { ConversationSubmissionFailures, ConversationSubmissionStates, ConversationSubmissionUnavailableReasons } from "@opencrane/state/conversation/adapter";
import type { ConversationDraft, ConversationSubmissionAvailability, ConversationSubmissionGateway, ConversationSubmitResult } from "@opencrane/state/conversation/adapter";

/** In-memory prompt-submission gateway for conversation feature tests. */
export class MockConversationSubmissionGateway implements ConversationSubmissionGateway
{
	/** Availability returned to the composer. */
	public availabilityResult: ConversationSubmissionAvailability = { canSubmit: false, reason: ConversationSubmissionUnavailableReasons.ThreadMessageContractMissing };

	/** Drafts submitted through this fake. */
	public readonly drafts: ConversationDraft[] = [];

	/** Result returned by the next submit call. */
	public submitResult: ConversationSubmitResult = { state: ConversationSubmissionStates.Failed, failure: ConversationSubmissionFailures.ThreadMessageContractMissing, retryable: false };

	/** @inheritdoc */
	public availability(_threadId: string | null): ConversationSubmissionAvailability
	{
		return this.availabilityResult;
	}

	/** @inheritdoc */
	public async submit(draft: ConversationDraft): Promise<ConversationSubmitResult>
	{
		this.drafts.push(draft);
		return this.submitResult;
	}
}
