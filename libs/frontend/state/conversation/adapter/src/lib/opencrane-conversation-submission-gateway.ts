import { Injectable } from "@angular/core";

import { ConversationSubmissionFailures, ConversationSubmissionStates, ConversationSubmissionUnavailableReasons, type ConversationDraft, type ConversationSubmissionAvailability, type ConversationSubmissionGateway, type ConversationSubmitResult } from "./conversation-submission.types.js";

/** Prompt-submission adapter that fails closed until the public message contract exists. */
@Injectable()
export class OpenCraneConversationSubmissionGateway implements ConversationSubmissionGateway
{
	/** @inheritdoc */
	public availability(_threadId: string | null): ConversationSubmissionAvailability
	{
		return { canSubmit: false, reason: ConversationSubmissionUnavailableReasons.ThreadMessageContractMissing };
	}

	/** @inheritdoc */
	public async submit(draft: ConversationDraft): Promise<ConversationSubmitResult>
	{
		if (draft.prompt.trim().length === 0)
		{
			return { state: ConversationSubmissionStates.Failed, failure: ConversationSubmissionFailures.BlankPrompt, retryable: false };
		}
		return { state: ConversationSubmissionStates.Failed, failure: ConversationSubmissionFailures.ThreadMessageContractMissing, retryable: false };
	}
}
