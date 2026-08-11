import type { RunEventType } from "@opencrane/models/agents";
import type { ConversationId } from "@opencrane/models/conversations";

/** Version of OpenCrane's intentionally small AG-UI event projection. */
export const AG_UI_PROJECTION_VERSION = "opencrane.ag-ui.v1";

/** Safe, user-facing fragments selected by the server-owned event reader. */
export interface AgUiPublicEventPayload
{
	/** Assistant message identifier, when the canonical event addresses one. */
	readonly messageId?: string;
	/** Assistant text delta, when the canonical event exposes one for this audience. */
	readonly delta?: string;
	/** Tool-call identifier, when the canonical event addresses one. */
	readonly toolCallId?: string;
	/** Display-safe tool name, when the canonical event exposes one. */
	readonly toolCallName?: string;
	/** Display-safe, already-redacted tool result text. */
	readonly toolResult?: string;
	/** Display-safe citation references selected by the server-owned replay reader. */
	readonly citations?: readonly AgUiCitationReference[];
	/** Display-safe artifact metadata references selected by the server-owned replay reader. */
	readonly artifacts?: readonly AgUiArtifactReference[];
	/** Display-safe memory references selected by the server-owned replay reader. */
	readonly memoryReferences?: readonly AgUiMemoryReference[];
}

/** Display availability vocabulary for source references. */
export enum AgUiSourceAccessStates
{
	/** Metadata can be displayed, but no browser read contract is available. */
	MetadataOnly = "metadata_only",
	/** The reference is stale, denied, deleted, or otherwise unavailable to open. */
	Unavailable = "unavailable",
	/** A public browser read contract exists for this reference. */
	Readable = "readable"
}

/** Display-safe citation selected by server replay authority. */
export interface AgUiCitationReference
{
	/** Stable display reference id. */
	readonly id: string;
	/** Human-readable source label. */
	readonly label: string;
	/** Display-safe source category. */
	readonly sourceKind?: string;
	/** Short display-safe snippet or summary. */
	readonly snippet?: string;
	/** ISO-8601 time at which the source was captured, when public. */
	readonly capturedAt?: string;
}

/** Display-safe artifact metadata selected by server replay authority. */
export interface AgUiArtifactReference
{
	/** Stable display reference id. */
	readonly id: string;
	/** Human-readable artifact label or filename. */
	readonly label: string;
	/** Stable artifact id, when public. */
	readonly artifactId?: string;
	/** Stable artifact revision id, when public. */
	readonly artifactRevisionId?: string;
	/** Public media type, when finalized. */
	readonly mediaType?: string;
	/** Decimal byte count, when finalized. */
	readonly byteLength?: string;
	/** ISO-8601 creation time, when public. */
	readonly createdAt?: string;
	/** Browser action availability selected by server-owned contracts. */
	readonly accessState: AgUiSourceAccessStates;
}

/** Display-safe memory reference selected by server replay authority. */
export interface AgUiMemoryReference
{
	/** Stable display reference id. */
	readonly id: string;
	/** Human-readable label, when the server chooses one for display. */
	readonly label?: string;
	/** Stable dataset id, when public for provenance display. */
	readonly datasetId?: string;
	/** Stable fact id, when public for provenance display. */
	readonly factId?: string;
	/** Immutable content digest, when public for provenance display. */
	readonly contentDigest?: string;
	/** Display-safe provenance category. */
	readonly sourceKind?: string;
	/** ISO-8601 source capture time, when public. */
	readonly capturedAt?: string;
	/** Server-selected display summary; never inferred by the browser. */
	readonly summary?: string;
}

/** One already-authorized canonical event made safe for protocol projection. */
export interface AgUiProjectionSourceEvent
{
	/** Durable cursor selected by the server-owned replay reader. */
	readonly cursor: string;
	/** Conversation selected by the authorized server-side replay reader. */
	readonly conversationId: ConversationId;
	/** Run that owns the canonical event. */
	readonly runId: string;
	/** Canonical positive decimal timeline position, preserving database BigInt precision. */
	readonly position: string;
	/** Canonical event vocabulary, retaining unknown strings for fail-safe rendering. */
	readonly eventType: RunEventType | (string & {});
	/** ISO-8601 time at which the canonical event occurred. */
	readonly occurredAt: string;
	/** Explicitly selected safe payload fields; raw canonical payloads never cross this contract. */
	readonly payload: AgUiPublicEventPayload;
}

/** Minimal standard AG-UI run-start event. */
export interface AgUiRunStartedEvent
{
	/** AG-UI discriminator. */
	readonly type: "RUN_STARTED";
	/** AG-UI-standard thread field populated with the canonical conversation identifier. */
	readonly threadId: string;
	/** Run represented by this event. */
	readonly runId: string;
}

/** Minimal standard AG-UI run-finished event. */
export interface AgUiRunFinishedEvent
{
	/** AG-UI discriminator. */
	readonly type: "RUN_FINISHED";
	/** AG-UI-standard thread field populated with the canonical conversation identifier. */
	readonly threadId: string;
	/** Run represented by this event. */
	readonly runId: string;
}

/** Minimal standard AG-UI text-message start event. */
export interface AgUiTextMessageStartEvent
{
	/** AG-UI discriminator. */
	readonly type: "TEXT_MESSAGE_START";
	/** Message being assembled. */
	readonly messageId: string;
	/** Assistant role for canonical model-output messages. */
	readonly role: "assistant";
}

/** Minimal standard AG-UI text-message delta event. */
export interface AgUiTextMessageContentEvent
{
	/** AG-UI discriminator. */
	readonly type: "TEXT_MESSAGE_CONTENT";
	/** Message being assembled. */
	readonly messageId: string;
	/** Display-safe text delta. */
	readonly delta: string;
}

/** Minimal standard AG-UI text-message completion event. */
export interface AgUiTextMessageEndEvent
{
	/** AG-UI discriminator. */
	readonly type: "TEXT_MESSAGE_END";
	/** Message that is no longer streaming. */
	readonly messageId: string;
}

/** Minimal standard AG-UI tool-call start event. */
export interface AgUiToolCallStartEvent
{
	/** AG-UI discriminator. */
	readonly type: "TOOL_CALL_START";
	/** Tool call being assembled. */
	readonly toolCallId: string;
	/** Display-safe tool name. */
	readonly toolCallName: string;
}

/** Minimal standard AG-UI tool-call argument delta event. */
export interface AgUiToolCallArgsEvent
{
	/** AG-UI discriminator. */
	readonly type: "TOOL_CALL_ARGS";
	/** Tool call being assembled. */
	readonly toolCallId: string;
	/** Display-safe argument delta. */
	readonly delta: string;
}

/** Minimal standard AG-UI tool-call completion event. */
export interface AgUiToolCallEndEvent
{
	/** AG-UI discriminator. */
	readonly type: "TOOL_CALL_END";
	/** Tool call that is no longer streaming. */
	readonly toolCallId: string;
}

/** Minimal standard AG-UI tool-result event. */
export interface AgUiToolCallResultEvent
{
	/** AG-UI discriminator. */
	readonly type: "TOOL_CALL_RESULT";
	/** Tool call producing the result. */
	readonly toolCallId: string;
	/** Display-safe tool result text. */
	readonly content: string;
}

/** OpenCrane source-reference event carrying display-safe provenance metadata. */
export interface AgUiSourceReferencesEvent
{
	/** AG-UI discriminator namespaced to OpenCrane's extension surface. */
	readonly type: "OPENCRANE_SOURCE_REFERENCES";
	/** Message these references support, when selected at message scope. */
	readonly messageId?: string;
	/** Display-safe citations selected by the server. */
	readonly citations: readonly AgUiCitationReference[];
	/** Display-safe artifact metadata selected by the server. */
	readonly artifacts: readonly AgUiArtifactReference[];
	/** Display-safe memory references selected by the server. */
	readonly memoryReferences: readonly AgUiMemoryReference[];
}

/** Vendor-namespaced signal for an event that has no stable standard mapping yet. */
export interface AgUiCustomEvent
{
	/** AG-UI discriminator. */
	readonly type: "CUSTOM";
	/** OpenCrane event name that clients may display but must not treat as a command. */
	readonly name: string;
	/** Non-sensitive canonical classification only. */
	readonly value: { readonly eventType: string };
}

/** One protocol event the offline projection can encode without an AG-UI runtime dependency. */
export type AgUiProjectionEvent = AgUiRunStartedEvent | AgUiRunFinishedEvent | AgUiTextMessageStartEvent | AgUiTextMessageContentEvent | AgUiTextMessageEndEvent | AgUiToolCallStartEvent | AgUiToolCallArgsEvent | AgUiToolCallEndEvent | AgUiToolCallResultEvent | AgUiSourceReferencesEvent | AgUiCustomEvent;

/** One SSE record ready for a server-owned authorized replay source to write. */
export interface AgUiSseRecord
{
	/** Durable canonical cursor used as the SSE event identifier. */
	readonly id: string;
	/** Fixed event name that distinguishes this versioned projection from canonical SSE. */
	readonly event: "ag-ui";
	/** Versioned, display-safe AG-UI event. */
	readonly data: AgUiProjectionEvent;
}
