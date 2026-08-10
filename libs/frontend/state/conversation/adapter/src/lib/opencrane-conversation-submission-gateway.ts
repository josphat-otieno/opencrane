import { Injectable } from "@angular/core";

import { ConversationSubmissionFailures, ConversationSubmissionStates, type ConversationDraft, type ConversationSubmissionAvailability, type ConversationSubmissionGateway, type ConversationSubmitResult } from "./conversation-submission.types.js";

/** Prompt-submission adapter that posts live conversation runs to the control plane. */
@Injectable()
export class OpenCraneConversationSubmissionGateway implements ConversationSubmissionGateway
{
	/** @inheritdoc */
	public availability(_threadId: string | null): ConversationSubmissionAvailability
	{
		return { canSubmit: true };
	}

	/** @inheritdoc */
	public async submit(draft: ConversationDraft): Promise<ConversationSubmitResult>
	{
		const prompt = draft.prompt.trim();
		if (prompt.length === 0)
		{
			return { state: ConversationSubmissionStates.Failed, failure: ConversationSubmissionFailures.BlankPrompt, retryable: false };
		}

		const threadId = draft.threadId ?? `thread-${crypto.randomUUID()}`;
		const requestIdempotencyKey = `req-${crypto.randomUUID()}`;

		try
		{
			const response = await fetch("/api/v1/me/runs", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					threadId,
					requestIdempotencyKey,
				}),
			});

			if (!response.ok)
			{
				return {
					state: ConversationSubmissionStates.Failed,
					failure: ConversationSubmissionFailures.Unknown,
					retryable: response.status >= 500,
				};
			}

			const data = (await response.json()) as { runId: string };
			const state = response.status === 201 ? ConversationSubmissionStates.Accepted : ConversationSubmissionStates.Idempotent;

			return {
				state,
				threadId,
				runId: data.runId,
				retryable: false,
			};
		}
		catch
		{
			return {
				state: ConversationSubmissionStates.Failed,
				failure: ConversationSubmissionFailures.Unknown,
				retryable: true,
			};
		}
	}
}
