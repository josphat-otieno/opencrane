import { AgUiSourceAccessStates, type AgUiArtifactReference, type AgUiCitationReference, type AgUiMemoryReference, type AgUiProjectionEvent, type AgUiProjectionSourceEvent, type AgUiSseRecord } from "./ag-ui-projection.types.js";

/** Project one server-authorized canonical event into the small, display-safe AG-UI subset. */
export function __ProjectAgUiEvent(source: AgUiProjectionSourceEvent): AgUiSseRecord
{
	return { id: source.cursor, event: "ag-ui", data: _Project(source) };
}

/** Select the narrowest standard event whose required display-safe fields are available. */
function _Project(source: AgUiProjectionSourceEvent): AgUiProjectionEvent
{
	switch (source.eventType)
	{
		case "run.accepted":
		case "run.started":
			return { type: "RUN_STARTED", threadId: source.threadId, runId: source.runId };
		case "run.completed":
		case "run.cancelled":
			return { type: "RUN_FINISHED", threadId: source.threadId, runId: source.runId };
		case "message.started":
			return typeof source.payload.messageId === "string" ? { type: "TEXT_MESSAGE_START", messageId: source.payload.messageId, role: "assistant" } : _Custom(source);
		case "message.delta":
			return typeof source.payload.messageId === "string" && typeof source.payload.delta === "string" ? { type: "TEXT_MESSAGE_CONTENT", messageId: source.payload.messageId, delta: source.payload.delta } : _Custom(source);
		case "message.completed":
			return typeof source.payload.messageId === "string" ? { type: "TEXT_MESSAGE_END", messageId: source.payload.messageId } : _Custom(source);
		case "tool.requested":
			return typeof source.payload.toolCallId === "string" && typeof source.payload.toolCallName === "string" ? { type: "TOOL_CALL_START", toolCallId: source.payload.toolCallId, toolCallName: source.payload.toolCallName } : _Custom(source);
		case "tool.completed":
			if (typeof source.payload.toolCallId !== "string") return _Custom(source);
			return { type: "TOOL_CALL_END", toolCallId: source.payload.toolCallId };
		case "message.sources":
		case "run.sources":
		case "source.references":
			return _SourceReferences(source);
		default:
			return _Custom(source);
	}
}

/** Project OpenCrane provenance metadata only when the redacted payload carries typed arrays. */
function _SourceReferences(source: AgUiProjectionSourceEvent): AgUiProjectionEvent
{
	const citations = source.payload.citations ?? [];
	const artifacts = source.payload.artifacts ?? [];
	const memoryReferences = source.payload.memoryReferences ?? [];
	if (citations.length === 0 && artifacts.length === 0 && memoryReferences.length === 0) return _Custom(source);
	return { type: "OPENCRANE_SOURCE_REFERENCES", ..._MessageId(source), citations: citations.map(_CitationReference), artifacts: artifacts.map(_ArtifactReference), memoryReferences: memoryReferences.map(_MemoryReference) };
}

/** Copy the optional message id without forwarding other payload fields. */
function _MessageId(source: AgUiProjectionSourceEvent): { readonly messageId: string } | {}
{
	return typeof source.payload.messageId === "string" ? { messageId: source.payload.messageId } : {};
}

/** Copy only display-safe citation fields into projected SSE. */
function _CitationReference(value: AgUiCitationReference): AgUiCitationReference
{
	let reference: AgUiCitationReference = { id: value.id, label: value.label };
	if (value.sourceKind) reference = { ...reference, sourceKind: value.sourceKind };
	if (value.snippet) reference = { ...reference, snippet: value.snippet };
	if (value.capturedAt) reference = { ...reference, capturedAt: value.capturedAt };
	return reference;
}

/** Copy only display-safe artifact metadata into projected SSE. */
function _ArtifactReference(value: AgUiArtifactReference): AgUiArtifactReference
{
	let reference: AgUiArtifactReference = { id: value.id, label: value.label, accessState: _AccessState(value.accessState) };
	if (value.artifactId) reference = { ...reference, artifactId: value.artifactId };
	if (value.artifactRevisionId) reference = { ...reference, artifactRevisionId: value.artifactRevisionId };
	if (value.mediaType) reference = { ...reference, mediaType: value.mediaType };
	if (value.byteLength) reference = { ...reference, byteLength: value.byteLength };
	if (value.createdAt) reference = { ...reference, createdAt: value.createdAt };
	return reference;
}

/** Copy only display-safe memory metadata into projected SSE. */
function _MemoryReference(value: AgUiMemoryReference): AgUiMemoryReference
{
	let reference: AgUiMemoryReference = { id: value.id };
	if (value.label) reference = { ...reference, label: value.label };
	if (value.datasetId) reference = { ...reference, datasetId: value.datasetId };
	if (value.factId) reference = { ...reference, factId: value.factId };
	if (value.contentDigest) reference = { ...reference, contentDigest: value.contentDigest };
	if (value.sourceKind) reference = { ...reference, sourceKind: value.sourceKind };
	if (value.capturedAt) reference = { ...reference, capturedAt: value.capturedAt };
	if (value.summary) reference = { ...reference, summary: value.summary };
	return reference;
}

/** Treat unknown artifact action states as metadata-only. */
function _AccessState(value: AgUiSourceAccessStates): AgUiSourceAccessStates
{
	if (value === AgUiSourceAccessStates.Readable) return AgUiSourceAccessStates.Readable;
	if (value === AgUiSourceAccessStates.Unavailable) return AgUiSourceAccessStates.Unavailable;
	return AgUiSourceAccessStates.MetadataOnly;
}

/** Keep unsupported, incomplete, and future source events observable without forwarding their payload. */
function _Custom(source: AgUiProjectionSourceEvent): AgUiProjectionEvent
{
	return { type: "CUSTOM", name: `opencrane.${source.eventType.replaceAll(".", "_")}`, value: { eventType: source.eventType } };
}
