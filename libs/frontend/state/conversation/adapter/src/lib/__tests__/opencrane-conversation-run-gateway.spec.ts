import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it, vi } from "vitest";

import { ControlPlaneApiService } from "@opencrane/core";

import { ConversationRunAdmissionFailures, ConversationRunAdmissionOutcomes, ConversationRunLifecycleStates } from "../conversation-run.types.js";
import { OpenCraneConversationRunGateway } from "../opencrane-conversation-run-gateway.js";

/** Construct a run gateway with controlled generated-client methods. */
function _gateway(post = vi.fn(), get = vi.fn())
{
	const injector = Injector.create({ providers: [{ provide: ControlPlaneApiService, useValue: { client: { POST: post, GET: get } } }] });
	const gateway = runInInjectionContext(injector, function _create(): OpenCraneConversationRunGateway
	{
		return new OpenCraneConversationRunGateway();
	});
	return { gateway, post, get };
}

describe("OpenCraneConversationRunGateway", function _Suite()
{
	it("posts only thread id and idempotency key to the generated run admission contract", async function _PostsRunAdmissionBody()
	{
		const post = vi.fn().mockResolvedValue({ data: { runId: "run-1" }, response: { status: 201 } });
		const { gateway } = _gateway(post);
		const attempt = { threadId: "thread-1", requestIdempotencyKey: "conversation-submit:thread-1:attempt-1" };

		const result = await gateway.admitRun(attempt);

		expect(post).toHaveBeenCalledWith("/me/runs", { body: attempt });
		expect(result).toEqual({ outcome: ConversationRunAdmissionOutcomes.Accepted, runId: "run-1", retryable: false });
	});

	it("maps idempotent admission success from HTTP 200", async function _MapsIdempotentAdmission()
	{
		const { gateway } = _gateway(vi.fn().mockResolvedValue({ data: { runId: "run-1" }, response: { status: 200 } }));

		const result = await gateway.admitRun({ threadId: "thread-1", requestIdempotencyKey: "conversation-submit:thread-1:attempt-1" });

		expect(result.outcome).toBe(ConversationRunAdmissionOutcomes.Idempotent);
		expect(result.runId).toBe("run-1");
	});

	it("maps known admission failures to typed user-safe categories", async function _MapsFailures()
	{
		const post = vi.fn()
			.mockResolvedValueOnce({ error: { error: "bad" }, response: { status: 400 } })
			.mockResolvedValueOnce({ error: { error: "full" }, response: { status: 429 } })
			.mockResolvedValueOnce({ error: { error: "down" }, response: { status: 503 } });
		const { gateway } = _gateway(post);
		const attempt = { threadId: "thread-1", requestIdempotencyKey: "conversation-submit:thread-1:attempt-1" };

		await expect(gateway.admitRun(attempt)).resolves.toMatchObject({ outcome: ConversationRunAdmissionOutcomes.Failed, failure: ConversationRunAdmissionFailures.InvalidRequest, retryable: false });
		await expect(gateway.admitRun(attempt)).resolves.toMatchObject({ outcome: ConversationRunAdmissionOutcomes.Failed, failure: ConversationRunAdmissionFailures.AdmissionCapacityFull, retryable: true });
		await expect(gateway.admitRun(attempt)).resolves.toMatchObject({ outcome: ConversationRunAdmissionOutcomes.Failed, failure: ConversationRunAdmissionFailures.Unavailable, retryable: true });
	});

	it("creates one retry-stable admission attempt outside presentation components", async function _CreatesAttempt()
	{
		const post = vi.fn().mockResolvedValue({ data: { runId: "run-1" }, response: { status: 201 } });
		const { gateway } = _gateway(post);
		const attempt = gateway.createAdmissionAttempt("thread-1");

		await gateway.admitRun(attempt);
		await gateway.admitRun(attempt);

		expect(attempt.requestIdempotencyKey).toContain("conversation-submit:thread-1:");
		expect(post).toHaveBeenNthCalledWith(1, "/me/runs", { body: attempt });
		expect(post).toHaveBeenNthCalledWith(2, "/me/runs", { body: attempt });
	});

	it("reads one owner-visible run status summary", async function _ReadsRunStatus()
	{
		const get = vi.fn().mockResolvedValue({ data: { runId: "run-1", attempt: 1, state: "running", threadId: "thread-1", agentRevisionId: "agent-revision-1", acceptedAt: "2026-08-09T00:00:00.000Z", finishedAt: null } });
		const { gateway } = _gateway(vi.fn(), get);

		const status = await gateway.getRunStatus("run-1");

		expect(get).toHaveBeenCalledWith("/me/runs/{runId}", { params: { path: { runId: "run-1" } } });
		expect(status.state).toBe(ConversationRunLifecycleStates.Running);
	});
});
