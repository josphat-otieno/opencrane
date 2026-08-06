/** Presentation roles accepted by the conversation feature. */
export enum ConversationMessageRoles
{
	/** Content authored by the signed-in user. */
	User = "user",
	/** Content produced by the admitted OpenCrane run. */
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

/** Read-only supporting panel selected beside the conversation stream. */
export enum ConversationPanelKinds
{
	/** No supporting panel is visible. */
	None = "none",
	/** Canonical context evidence supplied to the conversation. */
	Context = "context",
	/** Canonical files associated with the conversation. */
	Files = "files",
	/** Sharing availability and current access summary. */
	Share = "share"
}

/** Safe presentation model consumed by a conversation message component. */
export interface ConversationMessageView
{
	/** Stable canonical event or message identifier used for rendering. */
	readonly id: string;
	/** Author category; it grants no identity or authorization. */
	readonly role: ConversationMessageRoles;
	/** Sanitised plain text prepared by the render adapter. */
	readonly text: string;
	/** Current delivery state represented visually. */
	readonly state: ConversationMessageStates;
	/** Optional citations already validated for display. */
	readonly citations?: readonly ConversationCitationView[];
	/** Optional tool activity already reduced for display. */
	readonly tools?: readonly ConversationToolView[];
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
