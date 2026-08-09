import { ConversationProgressStates, __CreateIdleConversationProgressSnapshot } from "@opencrane/state/conversation/adapter";
import type { ConversationProgressGateway, ConversationProgressRefreshRequest, ConversationProgressSnapshot } from "@opencrane/state/conversation/adapter";

/** In-memory progress gateway for conversation feature tests. */
export class MockConversationProgressGateway implements ConversationProgressGateway
{
	/** Requests observed by this fake gateway. */
	public readonly requests: ConversationProgressRefreshRequest[] = [];

	/** Snapshot returned by the next refresh. */
	public snapshot: ConversationProgressSnapshot = { ...__CreateIdleConversationProgressSnapshot("thread-1"), state: ConversationProgressStates.Completed };

	/** @inheritdoc */
	public async refresh(request: ConversationProgressRefreshRequest): Promise<ConversationProgressSnapshot>
	{
		this.requests.push(request);
		return { ...this.snapshot, threadId: request.threadId };
	}
}
