import type { AgUiProjectionEvent } from "@opencrane/contracts";

/** Browser-owned view of one safe assistant message assembled from the projection. */
export interface AgUiMessageView
{
	/** Stable message identifier. */
	readonly id: string;
	/** Assembled display-safe assistant text. */
	readonly text: string;
	/** Whether the stream completed this message. */
	readonly complete: boolean;
}
/** Browser-owned view of one safe tool lifecycle. */
export interface AgUiToolView
{
	/** Stable tool-call identifier. */
	readonly id: string;
	/** Display-safe tool name. */
	readonly name: string | null;
	/** Whether the tool lifecycle ended. */
	readonly complete: boolean;
	/** Display-safe tool result, when emitted. */
	readonly result: string | null;
}
/** Immutable reduced state for one replayable projected event stream. */
export interface AgUiStreamState
{
	/** Latest durable cursor accepted from the authoritative replay source. */
	readonly cursor: string | null;
	/** Cursors already reduced in this in-memory stream session. */
	readonly seenCursors: ReadonlySet<string>;
	/** Current run identifier, when started by the stream. */
	readonly runId: string | null;
	/** Assistant messages assembled from safe events. */
	readonly messages: Readonly<Record<string, AgUiMessageView>>;
	/** Tool lifecycles assembled from safe events. */
	readonly tools: Readonly<Record<string, AgUiToolView>>;
	/** Names of payload-free custom display signals. */
	readonly customEvents: readonly string[];
	/** Display-safe source references attached to projected messages. */
	readonly sourceReferences: readonly AgUiSourceReferencesView[];
}

/** Display-safe citation reference selected by the server-owned projection. */
export interface AgUiCitationReference
{
	/** Stable display reference id. */
	readonly id: string;
	/** Human-readable source label. */
	readonly label: string;
	/** Optional display-safe source category. */
	readonly sourceKind?: string;
	/** Optional server-selected excerpt. */
	readonly snippet?: string;
	/** Optional capture timestamp. */
	readonly capturedAt?: string;
}

/** Display-safe artifact reference selected by the server-owned projection. */
export interface AgUiArtifactReference
{
	/** Stable display reference id. */
	readonly id: string;
	/** Human-readable artifact label. */
	readonly label: string;
	/** Server-selected display access state. */
	readonly accessState: string;
	/** Optional artifact id. */
	readonly artifactId?: string;
	/** Optional artifact revision id. */
	readonly artifactRevisionId?: string;
	/** Optional media type. */
	readonly mediaType?: string;
	/** Optional display byte length. */
	readonly byteLength?: string;
	/** Optional creation timestamp. */
	readonly createdAt?: string;
}

/** Display-safe memory reference selected by the server-owned projection. */
export interface AgUiMemoryReference
{
	/** Stable display reference id. */
	readonly id: string;
	/** Optional human-readable memory label. */
	readonly label?: string;
	/** Optional gateway-native dataset id. */
	readonly datasetId?: string;
	/** Optional memory fact id. */
	readonly factId?: string;
	/** Optional immutable content digest. */
	readonly contentDigest?: string;
	/** Optional display-safe source category. */
	readonly sourceKind?: string;
	/** Optional capture timestamp. */
	readonly capturedAt?: string;
	/** Optional server-selected summary. */
	readonly summary?: string;
}

/** Display-safe source references for one projected message. */
export interface AgUiSourceReferencesView
{
	/** Optional message id associated with these references. */
	readonly messageId?: string;
	/** Display-safe citation references. */
	readonly citations: readonly AgUiCitationReference[];
	/** Display-safe artifact references. */
	readonly artifacts: readonly AgUiArtifactReference[];
	/** Display-safe memory references. */
	readonly memoryReferences: readonly AgUiMemoryReference[];
}

/** Decoded SSE record before it is reduced into view state. */
export interface AgUiStreamRecord
{
	/** Opaque durable SSE cursor. */
	readonly id: string;
	/** Fixed versioned projection event name. */
	readonly event: "ag-ui";
	/** Validated display-safe projection data. */
	readonly data: AgUiProjectionEvent;
}
