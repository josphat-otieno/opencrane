import { ConversationRunAdmissionOutcomes, ConversationRunLifecycleStates } from "@opencrane/state/conversation/adapter";
import type { ConversationRunAdmissionAttempt, ConversationRunAdmissionResult, ConversationRunGateway, ConversationRunStatusView } from "@opencrane/state/conversation/adapter";

/** In-memory run gateway for conversation feature tests. */
export class MockConversationRunGateway implements ConversationRunGateway
{
	/** Attempts created by this fake gateway. */
	public readonly attempts: ConversationRunAdmissionAttempt[] = [];

	/** Result returned by the next admission call. */
	public admissionResult: ConversationRunAdmissionResult = { outcome: ConversationRunAdmissionOutcomes.Accepted, runId: "run-1", retryable: false };

	/** @inheritdoc */
	public createAdmissionAttempt(threadId: string): ConversationRunAdmissionAttempt
	{
		const attempt = { threadId, requestIdempotencyKey: `conversation-submit:${threadId}:mock` };
		this.attempts.push(attempt);
		return attempt;
	}

	/** @inheritdoc */
	public async admitRun(): Promise<ConversationRunAdmissionResult>
	{
		return this.admissionResult;
	}

	/** @inheritdoc */
	public async getRunStatus(runId: string): Promise<ConversationRunStatusView>
	{
		return { runId, attempt: 1, state: ConversationRunLifecycleStates.Accepted, threadId: "thread-1", agentRevisionId: "agent-revision-1", acceptedAt: "2026-08-09T00:00:00.000Z", finishedAt: null };
	}
}
