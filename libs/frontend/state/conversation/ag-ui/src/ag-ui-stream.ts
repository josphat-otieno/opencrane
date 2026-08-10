import type { AgUiArtifactReference, AgUiCitationReference, AgUiMemoryReference, AgUiProjectionEvent } from "@opencrane/contracts";
import { ___ParseAndValidateJson } from "@opencrane/util";

import type { AgUiStreamRecord, AgUiStreamState } from "./ag-ui-stream.types.js";

/** Construct an empty state that requires an authoritative stream before it can display content. */
export function __CreateAgUiStreamState(): AgUiStreamState
{
	return { cursor: null, seenCursors: new Set(), runId: null, messages: {}, tools: {}, sourceReferences: [], customEvents: [] };
}

/** Decode one complete AG-UI SSE record, rejecting malformed or non-projection input. */
export function __DecodeAgUiSseRecord(frame: string): AgUiStreamRecord | null
{
	const fields = new Map<string, string>();
	for (const line of frame.replaceAll("\r\n", "\n").split("\n"))
	{
		const separator = line.indexOf(":");
		if (separator > 0) fields.set(line.slice(0, separator), line.slice(separator + 1).trimStart());
	}
	const id = fields.get("id");
	const event = fields.get("event");
	const serialized = fields.get("data");
	if (!id || event !== "ag-ui" || !serialized || /[\r\n]/.test(id)) return null;
	try
	{
		const data = ___ParseAndValidateJson(serialized, "AG-UI SSE data", _ProjectionEvent);
		return { id, event: "ag-ui", data };
	}
	catch { return null; }
}

/** Return one supported projection event or reject the decoded transport value. */
function _ProjectionEvent(value: unknown): AgUiProjectionEvent
{
	if (!_IsProjectionEvent(value)) throw new Error("AG-UI SSE data must contain a supported projection event");
	return value;
}

/** Fold one replay record, refusing duplicate cursors without inferring order from opaque identifiers. */
export function __ReduceAgUiStream(state: AgUiStreamState, record: AgUiStreamRecord): AgUiStreamState
{
	if (state.seenCursors.has(record.id)) return state;
	const seenCursors = new Set(state.seenCursors).add(record.id);
	const event = record.data;
	if (event.type === "RUN_STARTED") return { ...state, seenCursors, cursor: record.id, runId: event.runId };
	if (event.type === "TEXT_MESSAGE_START") return { ...state, seenCursors, cursor: record.id, messages: { ...state.messages, [event.messageId]: { id: event.messageId, text: "", complete: false } } };
	if (event.type === "TEXT_MESSAGE_CONTENT")
	{
		const message = state.messages[event.messageId];
		if (!message) return { ...state, seenCursors, cursor: record.id };
		return { ...state, seenCursors, cursor: record.id, messages: { ...state.messages, [event.messageId]: { ...message, text: message.text + event.delta } } };
	}
	if (event.type === "TEXT_MESSAGE_END")
	{
		const message = state.messages[event.messageId];
		return message ? { ...state, seenCursors, cursor: record.id, messages: { ...state.messages, [event.messageId]: { ...message, complete: true } } } : { ...state, seenCursors, cursor: record.id };
	}
	if (event.type === "TOOL_CALL_START") return { ...state, seenCursors, cursor: record.id, tools: { ...state.tools, [event.toolCallId]: { id: event.toolCallId, name: event.toolCallName, complete: false, result: null } } };
	if (event.type === "TOOL_CALL_END")
	{
		const tool = state.tools[event.toolCallId];
		return tool ? { ...state, seenCursors, cursor: record.id, tools: { ...state.tools, [event.toolCallId]: { ...tool, complete: true } } } : { ...state, seenCursors, cursor: record.id };
	}
	if (event.type === "TOOL_CALL_RESULT")
	{
		const tool = state.tools[event.toolCallId];
		return tool ? { ...state, seenCursors, cursor: record.id, tools: { ...state.tools, [event.toolCallId]: { ...tool, complete: true, result: event.content } } } : { ...state, seenCursors, cursor: record.id };
	}
	if (event.type === "OPENCRANE_SOURCE_REFERENCES")
	{
		return { ...state, seenCursors, cursor: record.id, sourceReferences: [...state.sourceReferences, { messageId: event.messageId ?? null, citations: event.citations.map(_CitationReference), artifacts: event.artifacts.map(_ArtifactReference), memoryReferences: event.memoryReferences.map(_MemoryReference) }] };
	}
	if (event.type === "CUSTOM") return { ...state, seenCursors, cursor: record.id, customEvents: [...state.customEvents, event.name] };
	return { ...state, seenCursors, cursor: record.id };
}

/** Return the durable cursor a reconnecting client must present to its future authorized reader. */
export function __AgUiResumeCursor(state: AgUiStreamState): string | undefined { return state.cursor ?? undefined; }

/** Validate only the intentionally supported, display-safe event vocabulary. */
function _IsProjectionEvent(value: unknown): value is AgUiProjectionEvent
{
	if (typeof value !== "object" || value === null) return false;
	const event = value as Record<string, unknown>;
	if (event["type"] === "RUN_STARTED" || event["type"] === "RUN_FINISHED") return typeof event["threadId"] === "string" && typeof event["runId"] === "string";
	if (event["type"] === "TEXT_MESSAGE_START") return typeof event["messageId"] === "string" && event["role"] === "assistant";
	if (event["type"] === "TEXT_MESSAGE_CONTENT") return typeof event["messageId"] === "string" && typeof event["delta"] === "string";
	if (event["type"] === "TEXT_MESSAGE_END") return typeof event["messageId"] === "string";
	if (event["type"] === "TOOL_CALL_START") return typeof event["toolCallId"] === "string" && typeof event["toolCallName"] === "string";
	if (event["type"] === "TOOL_CALL_ARGS" || event["type"] === "TOOL_CALL_END") return typeof event["toolCallId"] === "string";
	if (event["type"] === "TOOL_CALL_RESULT") return typeof event["toolCallId"] === "string" && typeof event["content"] === "string";
	if (event["type"] === "OPENCRANE_SOURCE_REFERENCES") return _IsSourceReferencesEvent(event);
	return event["type"] === "CUSTOM" && typeof event["name"] === "string" && typeof event["value"] === "object" && event["value"] !== null && typeof (event["value"] as Record<string, unknown>)["eventType"] === "string";
}

/** Validate OpenCrane source-reference extension events without accepting raw authority fields. */
function _IsSourceReferencesEvent(event: Record<string, unknown>): boolean
{
	return (event["messageId"] === undefined || typeof event["messageId"] === "string") && Array.isArray(event["citations"]) && Array.isArray(event["artifacts"]) && Array.isArray(event["memoryReferences"]) && event["citations"].every(_IsCitation) && event["artifacts"].every(_IsArtifact) && event["memoryReferences"].every(_IsMemoryReference);
}

/** Validate one display-safe citation reference. */
function _IsCitation(value: unknown): boolean
{
	if (typeof value !== "object" || value === null) return false;
	const citation = value as Record<string, unknown>;
	return typeof citation["id"] === "string" && typeof citation["label"] === "string" && _OptionalStrings(citation, ["sourceKind", "snippet", "capturedAt"]);
}

/** Validate one display-safe artifact reference. */
function _IsArtifact(value: unknown): boolean
{
	if (typeof value !== "object" || value === null) return false;
	const artifact = value as Record<string, unknown>;
	return typeof artifact["id"] === "string" && typeof artifact["label"] === "string" && typeof artifact["accessState"] === "string" && _OptionalStrings(artifact, ["artifactId", "artifactRevisionId", "mediaType", "byteLength", "createdAt"]);
}

/** Validate one display-safe memory reference. */
function _IsMemoryReference(value: unknown): boolean
{
	if (typeof value !== "object" || value === null) return false;
	const memory = value as Record<string, unknown>;
	return typeof memory["id"] === "string" && _OptionalStrings(memory, ["label", "datasetId", "factId", "contentDigest", "sourceKind", "capturedAt", "summary"]);
}

/** Validate optional string-only fields. */
function _OptionalStrings(value: Record<string, unknown>, keys: readonly string[]): boolean
{
	return keys.every(function _string(key: string): boolean
	{
		return value[key] === undefined || typeof value[key] === "string";
	});
}

/** Copy only display-safe citation fields into browser state. */
function _CitationReference(value: AgUiCitationReference): AgUiCitationReference
{
	let reference: AgUiCitationReference = { id: value.id, label: value.label };
	if (value.sourceKind) reference = { ...reference, sourceKind: value.sourceKind };
	if (value.snippet) reference = { ...reference, snippet: value.snippet };
	if (value.capturedAt) reference = { ...reference, capturedAt: value.capturedAt };
	return reference;
}

/** Copy only display-safe artifact metadata into browser state. */
function _ArtifactReference(value: AgUiArtifactReference): AgUiArtifactReference
{
	let reference: AgUiArtifactReference = { id: value.id, label: value.label, accessState: value.accessState };
	if (value.artifactId) reference = { ...reference, artifactId: value.artifactId };
	if (value.artifactRevisionId) reference = { ...reference, artifactRevisionId: value.artifactRevisionId };
	if (value.mediaType) reference = { ...reference, mediaType: value.mediaType };
	if (value.byteLength) reference = { ...reference, byteLength: value.byteLength };
	if (value.createdAt) reference = { ...reference, createdAt: value.createdAt };
	return reference;
}

/** Copy only display-safe memory metadata into browser state. */
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
