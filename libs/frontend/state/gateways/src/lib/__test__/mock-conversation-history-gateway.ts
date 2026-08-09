import type { ConversationHistoryEntryView, ConversationHistoryGateway } from "@opencrane/state/conversation/adapter";

/** In-memory conversation history reader for shell tests. */
export class MockConversationHistoryGateway implements ConversationHistoryGateway
{
	/** Entries returned by the next history read. */
	public entries: readonly ConversationHistoryEntryView[] = [];

	/** @inheritdoc */
	public async listRecent(): Promise<readonly ConversationHistoryEntryView[]>
	{
		return this.entries;
	}
}
