import { __CreateEmptyConversationReplayView } from "@opencrane/state/conversation/adapter";
import type { ConversationReplayGateway, ConversationReplayView } from "@opencrane/state/conversation/adapter";

/** In-memory conversation replay reader for routed conversation tests. */
export class MockConversationReplayGateway implements ConversationReplayGateway
{
	/** Replay returned by the next route read. */
	public replay: ConversationReplayView = __CreateEmptyConversationReplayView(null);

	/** @inheritdoc */
	public async read(threadId: string): Promise<ConversationReplayView>
	{
		return { ...this.replay, threadId };
	}
}
