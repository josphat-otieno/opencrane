/** Presentation roles accepted by the conversation read path. */
export enum ConversationMessageRoles
{
	/** Content authored by the signed-in user. */
	User = "user",
	/** Content produced by an admitted OpenCrane run. */
	Assistant = "assistant"
}

/** Delivery states that change how a rendered message is presented. */
export enum ConversationMessageStates
{
	/** Canonical content is complete. */
	Complete = "complete",
	/** The assistant is still producing canonical events. */
	Loading = "loading",
	/** The run failed before completing the message. */
	Failed = "failed"
}

/** Display-safe citation attached to an assistant message. */
export interface ConversationCitationView
{
	/** Stable display key. */
	readonly id: string;
	/** Human-readable source label; never an inferred private resource path. */
	readonly label: string;
}

/** Display-safe tool activity attached to an assistant message. */
export interface ConversationToolView
{
	/** Stable tool event key. */
	readonly id: string;
	/** Human-readable action label. */
	readonly label: string;
	/** Whether the canonical tool event completed. */
	readonly complete: boolean;
}

/** Safe presentation model consumed by a conversation message component. */
export interface ConversationMessageView
{
	/** Stable canonical event or message identifier used for rendering. */
	readonly id: string;
	/** Author category; it grants no identity or authorization. */
	readonly role: ConversationMessageRoles;
	/** Sanitised plain text prepared by the read adapter. */
	readonly text: string;
	/** Current delivery state represented visually. */
	readonly state: ConversationMessageStates;
	/** Optional citations already validated for display. */
	readonly citations?: readonly ConversationCitationView[];
	/** Optional tool activity already reduced for display. */
	readonly tools?: readonly ConversationToolView[];
}

/** Display-safe context evidence associated with a conversation. */
export interface ConversationContextItemView
{
	/** Stable canonical evidence identifier. */
	readonly id: string;
	/** Human-readable evidence title. */
	readonly title: string;
	/** Display-safe source category. */
	readonly source: string;
}

/** Display-safe file metadata associated with a conversation. */
export interface ConversationFileView
{
	/** Stable canonical artifact identifier. */
	readonly id: string;
	/** Human-readable filename without private storage paths. */
	readonly name: string;
	/** Optional display-only file type. */
	readonly type?: string;
}

/** Display-safe history entry derived from canonical OpenCrane run/thread data. */
export interface ConversationHistoryEntryView
{
	/** Opaque server-issued thread identifier used only for routing. */
	readonly threadId: string;
	/** Most recent run seen for this thread in the canonical run listing. */
	readonly runId: string;
	/** Human-readable title derived from public run metadata. */
	readonly title: string;
	/** ISO-8601 timestamp used for sorting and assistive labels. */
	readonly updatedAt: string;
	/** Optional display-only recency or lifecycle label. */
	readonly recency?: string;
}

/** Display-safe replay result prepared for routed conversation rendering. */
export interface ConversationReplayView
{
	/** Opaque server-issued thread identifier represented by the replay. */
	readonly threadId: string | null;
	/** Latest durable cursor accepted from the authoritative replay source. */
	readonly cursor: string | null;
	/** Current run identifier, when present in the replay stream. */
	readonly runId: string | null;
	/** Message rows assembled from display-safe replay events. */
	readonly messages: readonly ConversationMessageView[];
	/** Payload-free custom display signals surfaced by the projection. */
	readonly customEvents: readonly string[];
}
