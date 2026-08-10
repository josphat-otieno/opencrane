export { ConversationMessageRoles, ConversationMessageStates } from "@opencrane/state/conversation/adapter";
export type { ConversationCitationView, ConversationContextItemView, ConversationFileView, ConversationMemoryReferenceView, ConversationMessageView, ConversationToolView } from "@opencrane/state/conversation/adapter";

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
