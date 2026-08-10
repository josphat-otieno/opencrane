import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationSubmissionFailures, ConversationSubmissionStates } from "../conversation-submission.types.js";
import { OpenCraneConversationSubmissionGateway } from "../opencrane-conversation-submission-gateway.js";

describe("OpenCraneConversationSubmissionGateway", function _Suite()
{
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("reports availability as ready to submit", function _ReportsAvailability()
	{
		const gateway = new OpenCraneConversationSubmissionGateway();

		expect(gateway.availability("thread-1")).toEqual({ canSubmit: true });
	});

	it("fails for blank prompts without calling backend", async function _FailsBlankPrompt()
	{
		const gateway = new OpenCraneConversationSubmissionGateway();

		await expect(gateway.submit({ threadId: null, prompt: "   " })).resolves.toEqual({
			state: ConversationSubmissionStates.Failed,
			failure: ConversationSubmissionFailures.BlankPrompt,
			retryable: false,
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it("submits valid prompt and returns accepted run", async function _SubmitsSuccessfully()
	{
		const gateway = new OpenCraneConversationSubmissionGateway();
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			status: 201,
			json: async () => ({ runId: "run-123" }),
		} as Response);

		const result = await gateway.submit({ threadId: "thread-1", prompt: "hello" });

		expect(fetch).toHaveBeenCalledWith("/api/v1/me/runs", expect.objectContaining({ method: "POST" }));
		expect(result).toMatchObject({
			state: ConversationSubmissionStates.Accepted,
			threadId: "thread-1",
			runId: "run-123",
			retryable: false,
		});
	});
});
