/** Display-safe history entry supplied by the canonical thread reader. */
export interface WorkspaceConversationHistoryEntryView
{
	/** Opaque server-issued thread identifier used only for routing. */
	readonly threadId: string;
	/** Human-readable title derived by the canonical owner. */
	readonly title: string;
	/** Optional display-only recency label. */
	readonly recency?: string;
}
