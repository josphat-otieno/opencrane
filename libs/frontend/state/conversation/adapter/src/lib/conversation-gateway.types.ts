import type { ConversationHistoryEntryView, ConversationReplayView } from "./conversation-display.types.js";

/** Reads recent conversation/thread summaries available to the signed-in user. */
export interface ConversationHistoryGateway
{
	/**
	 * List recent display-safe conversation entries.
	 *
	 * @returns Thread summaries derived from the public OpenCrane API.
	 */
	listRecent(): Promise<readonly ConversationHistoryEntryView[]>;
}

/** Reads one canonical conversation replay for the signed-in participant. */
export interface ConversationReplayGateway
{
	/**
	 * Read and reduce a canonical replay page.
	 *
	 * @param threadId - Opaque server-issued conversation thread identifier.
	 * @param cursor - Opaque server-issued resume cursor, when continuing a prior replay.
	 * @returns Display-safe replay rows for the route.
	 */
	read(threadId: string, cursor?: string): Promise<ConversationReplayView>;
}
