import { describe, expect, it } from "vitest";

import { ConversationSubmissionFailures, ConversationSubmissionStates, ConversationSubmissionUnavailableReasons } from "../conversation-submission.types.js";
import { OpenCraneConversationSubmissionGateway } from "../opencrane-conversation-submission-gateway.js";

describe("OpenCraneConversationSubmissionGateway", function _Suite()
{
	it("reports the missing public thread-message contract without inventing browser authority", function _ReportsContractGap()
	{
		const gateway = new OpenCraneConversationSubmissionGateway();

		expect(gateway.availability("thread-1")).toEqual({ canSubmit: false, reason: ConversationSubmissionUnavailableReasons.ThreadMessageContractMissing });
	});

	it("fails closed for blank and non-blank prompts until the backend contract exists", async function _FailsClosed()
	{
		const gateway = new OpenCraneConversationSubmissionGateway();

		await expect(gateway.submit({ threadId: null, prompt: "   " })).resolves.toEqual({ state: ConversationSubmissionStates.Failed, failure: ConversationSubmissionFailures.BlankPrompt, retryable: false });
		await expect(gateway.submit({ threadId: "thread-1", prompt: "hello" })).resolves.toEqual({ state: ConversationSubmissionStates.Failed, failure: ConversationSubmissionFailures.ThreadMessageContractMissing, retryable: false });
	});
});
