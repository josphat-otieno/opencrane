import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it, vi } from "vitest";

import { CONVERSATION_REPLAY_GATEWAY, CONVERSATION_RUN_GATEWAY } from "../conversation-gateway.tokens.js";
import { ConversationProgressStates } from "../conversation-progress.types.js";
import { ConversationRunAdmissionOutcomes, ConversationRunLifecycleStates } from "../conversation-run.types.js";
import { OpenCraneConversationProgressGateway } from "../opencrane-conversation-progress-gateway.js";
import type { ConversationReplayView } from "../conversation-display.types.js";
import type { ConversationReplayGateway } from "../conversation-gateway.types.js";
import type { ConversationRunGateway, ConversationRunStatusView } from "../conversation-run.types.js";

describe("OpenCraneConversationProgressGateway", function _Suite()
{
	it("uses the opaque cursor for follow-up replay reads", async function _UsesCursor()
	{
		const replayGateway = _ReplayGateway();
		const runGateway = _RunGateway(ConversationRunLifecycleStates.Running);
		const gateway = _gateway(replayGateway, runGateway);

		await gateway.refresh({ threadId: "thread-1", runId: "run-1", cursor: "cursor-1" });

		expect(replayGateway.read).toHaveBeenCalledWith("thread-1", "cursor-1");
		expect(runGateway.getRunStatus).toHaveBeenCalledWith("run-1");
	});

	it("falls back to full replay after cursor resume failure", async function _FallsBackToFullReplay()
	{
		const read = vi.fn()
			.mockRejectedValueOnce(new Error("cursor failed"))
			.mockResolvedValueOnce(_replay("thread-1", "run-1", "cursor-2"));
		const replayGateway: ConversationReplayGateway = { read };
		const gateway = _gateway(replayGateway, _RunGateway(ConversationRunLifecycleStates.Running));

		const snapshot = await gateway.refresh({ threadId: "thread-1", runId: "run-1", cursor: "cursor-1" });

		expect(read).toHaveBeenNthCalledWith(1, "thread-1", "cursor-1");
		expect(read).toHaveBeenNthCalledWith(2, "thread-1");
		expect(snapshot.cursor).toBe("cursor-2");
	});

	it("maps terminal and waiting run statuses into progress states", async function _MapsRunStatus()
	{
		const completed = await _gateway(_ReplayGateway(), _RunGateway(ConversationRunLifecycleStates.Completed)).refresh({ threadId: "thread-1", runId: "run-1" });
		const approval = await _gateway(_ReplayGateway(), _RunGateway(ConversationRunLifecycleStates.WaitingForApproval)).refresh({ threadId: "thread-1", runId: "run-1" });

		expect(completed.state).toBe(ConversationProgressStates.Completed);
		expect(completed.terminal).toBe(true);
		expect(approval.state).toBe(ConversationProgressStates.WaitingForApproval);
		expect(approval.terminal).toBe(false);
	});

	it("ignores a query run id that belongs to a different thread", async function _IgnoresMismatchedQueryRun()
	{
		const replayGateway = _ReplayGateway("thread-1", null, "cursor-1");
		const runGateway = _RunGateway(ConversationRunLifecycleStates.Running, "thread-2", "run-2");
		const gateway = _gateway(replayGateway, runGateway);

		const snapshot = await gateway.refresh({ threadId: "thread-1", runId: "run-2" });

		expect(runGateway.getRunStatus).toHaveBeenCalledWith("run-2");
		expect(snapshot.state).toBe(ConversationProgressStates.Idle);
		expect(snapshot.runId).toBeNull();
	});

	it("falls back to the replay run when a query run id is stale", async function _FallsBackToReplayRun()
	{
		const replayGateway = _ReplayGateway("thread-1", "run-1", "cursor-1");
		const stale = _runStatus(ConversationRunLifecycleStates.Running, "thread-2", "run-2");
		const current = _runStatus(ConversationRunLifecycleStates.Completed, "thread-1", "run-1");
		const runGateway = _RunGatewaySequence([stale, current]);
		const gateway = _gateway(replayGateway, runGateway);

		const snapshot = await gateway.refresh({ threadId: "thread-1", runId: "run-2" });

		expect(runGateway.getRunStatus).toHaveBeenNthCalledWith(1, "run-2");
		expect(runGateway.getRunStatus).toHaveBeenNthCalledWith(2, "run-1");
		expect(snapshot.state).toBe(ConversationProgressStates.Completed);
		expect(snapshot.runId).toBe("run-1");
	});
});

/** Create a progress gateway with fake ports. */
function _gateway(replayGateway: ConversationReplayGateway, runGateway: ConversationRunGateway): OpenCraneConversationProgressGateway
{
	const injector = Injector.create({
		providers: [
			{ provide: CONVERSATION_REPLAY_GATEWAY, useValue: replayGateway },
			{ provide: CONVERSATION_RUN_GATEWAY, useValue: runGateway }
		]
	});
	return runInInjectionContext(injector, function _create(): OpenCraneConversationProgressGateway
	{
		return new OpenCraneConversationProgressGateway();
	});
}

/** Create a replay gateway fixture. */
function _ReplayGateway(threadId: string = "thread-1", runId: string | null = "run-1", cursor: string = "cursor-1"): ConversationReplayGateway & { readonly read: ReturnType<typeof vi.fn> }
{
	const read = vi.fn().mockResolvedValue(_replay(threadId, runId, cursor));
	return { read };
}

/** Create a run gateway fixture. */
function _RunGateway(state: ConversationRunLifecycleStates, threadId: string | null = "thread-1", runId: string = "run-1"): ConversationRunGateway & { readonly getRunStatus: ReturnType<typeof vi.fn> }
{
	const runStatus = _runStatus(state, threadId, runId);
	const getRunStatus = vi.fn().mockResolvedValue(runStatus);
	return _RunGatewayWithStatusReader(getRunStatus);
}

/** Create a run gateway fixture that returns statuses in order. */
function _RunGatewaySequence(statuses: readonly ConversationRunStatusView[]): ConversationRunGateway & { readonly getRunStatus: ReturnType<typeof vi.fn> }
{
	let index = 0;
	const getRunStatus = vi.fn(async function _getRunStatus(): Promise<ConversationRunStatusView>
	{
		const next = statuses[index];
		index += 1;
		if (next === undefined) throw new Error("missing status fixture");
		return next;
	});
	return _RunGatewayWithStatusReader(getRunStatus);
}

/** Create a full run gateway fixture around a status reader. */
function _RunGatewayWithStatusReader(getRunStatus: ReturnType<typeof vi.fn>): ConversationRunGateway & { readonly getRunStatus: ReturnType<typeof vi.fn> }
{
	return {
		createAdmissionAttempt: function _createAdmissionAttempt()
		{
			return { threadId: "thread-1", requestIdempotencyKey: "key-1" };
		},
		admitRun: async function _admitRun()
		{
			return { outcome: ConversationRunAdmissionOutcomes.Accepted, runId: "run-1", retryable: false };
		},
		getRunStatus
	};
}

/** Create one owner-visible run status fixture. */
function _runStatus(state: ConversationRunLifecycleStates, threadId: string | null, runId: string): ConversationRunStatusView
{
	return { runId, attempt: 1, state, threadId, agentRevisionId: "agent-revision-1", acceptedAt: "2026-08-09T00:00:00.000Z", finishedAt: state === ConversationRunLifecycleStates.Completed ? "2026-08-09T00:01:00.000Z" : null };
}

/** Create one replay fixture. */
function _replay(threadId: string, runId: string | null, cursor: string): ConversationReplayView
{
	return { threadId, runId, cursor, customEvents: [], citations: [], files: [], memoryReferences: [], messages: [] };
}
