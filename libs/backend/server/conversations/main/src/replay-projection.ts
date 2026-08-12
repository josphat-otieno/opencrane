import type { AgUiPublicArtifactReference, AgUiPublicCitationReference, AgUiPublicEventPayload, AgUiPublicMemoryReference } from "@opencrane/contracts";

import type { ConversationReplayEventRow, ConversationReplayProjectionResult } from "./replay-projection.types.js";

/** Redact one canonical timeline row into only the fields the AG-UI projection contract allows. */
export function __ProjectConversationReplayEvent(row: ConversationReplayEventRow): ConversationReplayProjectionResult
{
	if (!row.cursor || !row.conversationId || !row.runId || !/^[1-9]\d*$/u.test(row.position) || !row.type || Number.isNaN(Date.parse(row.occurredAt))) return null;
	return { cursor: row.cursor, conversationId: row.conversationId, runId: row.runId, position: row.position, eventType: row.type, occurredAt: row.occurredAt, payload: _SafePayload(row.type, row.payload) };
}

/** Select only schema-free display fields needed by known projected event types. */
function _SafePayload(type: string, payload: Readonly<Record<string, unknown>>): AgUiPublicEventPayload
{
	if (type === "message.started" || type === "message.completed") return _Strings(payload, ["messageId"]);
	if (type === "message.delta") return _Strings(payload, ["messageId", "delta"]);
	if (type === "tool.requested") return _Strings(payload, ["toolCallId", "toolCallName"]);
	if (type === "tool.completed") return _Strings(payload, ["toolCallId"]);
	if (type === "source.references") return _SourceReferences(payload);
	return {};
}

/** Copy named string values and drop every other canonical payload field. */
function _Strings(payload: Readonly<Record<string, unknown>>, names: readonly (keyof AgUiPublicEventPayload)[]): AgUiPublicEventPayload
{
	const result: Record<string, string> = {};
	for (const name of names)
	{
		const value = payload[name];
		if (typeof value === "string") result[name] = value;
	}
	return result;
}

/** Copy display-safe source references and drop every raw authority or lease field. */
function _SourceReferences(payload: Readonly<Record<string, unknown>>): AgUiPublicEventPayload
{
	if (!_IsSourceReferencesPayload(payload)) return {};
	return { sourceReferences: {
		...(payload["messageId"] === undefined ? {} : { messageId: payload["messageId"] }),
		citations: payload["citations"].map(_CitationReference),
		artifacts: payload["artifacts"].map(_ArtifactReference),
		memoryReferences: payload["memoryReferences"].map(_MemoryReference)
	} };
}

/** Validate one source-reference payload shape before copying it. */
function _IsSourceReferencesPayload(payload: Readonly<Record<string, unknown>>): payload is { readonly messageId?: string; readonly citations: readonly AgUiPublicCitationReference[]; readonly artifacts: readonly AgUiPublicArtifactReference[]; readonly memoryReferences: readonly AgUiPublicMemoryReference[] }
{
	return (payload["messageId"] === undefined || typeof payload["messageId"] === "string") && Array.isArray(payload["citations"]) && Array.isArray(payload["artifacts"]) && Array.isArray(payload["memoryReferences"]) && payload["citations"].every(_IsCitation) && payload["artifacts"].every(_IsArtifact) && payload["memoryReferences"].every(_IsMemoryReference);
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

/** Copy only display-safe citation fields into the public projection. */
function _CitationReference(value: AgUiPublicCitationReference): AgUiPublicCitationReference
{
	let reference: AgUiPublicCitationReference = { id: value.id, label: value.label };
	if (value.sourceKind) reference = { ...reference, sourceKind: value.sourceKind };
	if (value.snippet) reference = { ...reference, snippet: value.snippet };
	if (value.capturedAt) reference = { ...reference, capturedAt: value.capturedAt };
	return reference;
}

/** Copy only display-safe artifact metadata into the public projection. */
function _ArtifactReference(value: AgUiPublicArtifactReference): AgUiPublicArtifactReference
{
	let reference: AgUiPublicArtifactReference = { id: value.id, label: value.label, accessState: value.accessState };
	if (value.artifactId) reference = { ...reference, artifactId: value.artifactId };
	if (value.artifactRevisionId) reference = { ...reference, artifactRevisionId: value.artifactRevisionId };
	if (value.mediaType) reference = { ...reference, mediaType: value.mediaType };
	if (value.byteLength) reference = { ...reference, byteLength: value.byteLength };
	if (value.createdAt) reference = { ...reference, createdAt: value.createdAt };
	return reference;
}

/** Copy only display-safe memory metadata into the public projection. */
function _MemoryReference(value: AgUiPublicMemoryReference): AgUiPublicMemoryReference
{
	let reference: AgUiPublicMemoryReference = { id: value.id };
	if (value.label) reference = { ...reference, label: value.label };
	if (value.datasetId) reference = { ...reference, datasetId: value.datasetId };
	if (value.factId) reference = { ...reference, factId: value.factId };
	if (value.contentDigest) reference = { ...reference, contentDigest: value.contentDigest };
	if (value.sourceKind) reference = { ...reference, sourceKind: value.sourceKind };
	if (value.capturedAt) reference = { ...reference, capturedAt: value.capturedAt };
	if (value.summary) reference = { ...reference, summary: value.summary };
	return reference;
}
