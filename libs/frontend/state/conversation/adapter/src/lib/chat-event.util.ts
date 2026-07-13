import { MessageDelivery } from "@opencrane/core";
import { inferAttachmentKind, isToolCallContentType, isToolErrorOutput, mediaKindFromMime, resolveToolBlockArgs } from "@opencrane/state/conversation/render";

import { ChatEvent } from "./gateway-protocol.types";

/**
 * Pure readers over a validated `chat` event payload, normalising the two live
 * shapes (openclaw v2026.x object `message` vs the legacy flat `deltaText`/string
 * `message`) into the few values the transcript renders. Kept pure + exported so
 * they are unit-tested directly against a captured live frame.
 */

/** The message OBJECT of a v2026.x chat event, or null for the flat/string form. */
function _messageObject(ev: ChatEvent): { role?: string; content?: unknown; stopReason?: unknown } | null
{
	const msg = (ev as { message?: unknown }).message;
	return msg !== null && typeof msg === "object" ? (msg as { role?: string; content?: unknown; stopReason?: unknown }) : null;
}

/** The raw message record (all fields), for message-level reads (e.g. a `toolResult` message). */
function _rawMessage(ev: ChatEvent): Record<string, unknown>
{
	const msg = (ev as { message?: unknown }).message;
	return msg !== null && typeof msg === "object" ? (msg as Record<string, unknown>) : (ev as unknown as Record<string, unknown>);
}

/**
 * A tool RESULT built from a `role: "toolResult"` message (OpenClaw's real shape — verified
 * against a live pod transcript): the result is its OWN message carrying `toolCallId`, an `isError`
 * flag, and `content: [{ type: "text", text }]`, NOT an inline `tool_result` content part. Returns
 * null when the message is not a tool-result message.
 */
function _messageToolResult(ev: ChatEvent): ChatEventToolResult | null
{
	if (_ChatEventRole(ev) !== "toolResult")
	{
		return null;
	}
	const m = _rawMessage(ev);
	const id = _toolId(m as ContentPart);
	const output = _toolResultText(m["content"]);
	const explicit = m["isError"] ?? m["is_error"];
	return { id, output, isError: typeof explicit === "boolean" ? explicit : isToolErrorOutput(output) };
}

/** A single typed content part of a v2026.x message. */
interface ContentPart
{
	/** Part discriminator ("text" | "thinking" | "reasoning" | "tool_use" | "tool_result" | "image" | …). */
	type?: string;
	/** Text payload (text / reasoning parts). */
	text?: string;
	/** Reasoning payload (Anthropic-style thinking parts). */
	thinking?: string;
	/** Reasoning summary (openai-responses reasoning parts). */
	summary?: string;
	/** Tool name (tool_use parts). */
	name?: string;
	/** Tool input arguments (tool_use parts). */
	input?: unknown;
	/** Stable tool-call id (tool_use / tool_result parts; snake or camel case). */
	id?: string;
	tool_use_id?: string;
	toolCallId?: string;
	tool_call_id?: string;
	/** Tool result body (tool_result parts) — a string or nested `{text}` content array. */
	content?: unknown;
	/** Whether a tool_result is an error (snake or camel case). */
	is_error?: boolean;
	isError?: boolean;
	/** Attachment payload (attachment parts). */
	attachment?: { url?: unknown; kind?: unknown; label?: unknown; mimeType?: unknown; isVoiceNote?: unknown };
	/** Media source (Anthropic image/audio parts: `{ source: { url | media_type, data } }`). */
	source?: { url?: unknown; media_type?: unknown; type?: unknown; data?: unknown };
	/** Direct media url (some providers). */
	url?: unknown;
	/** Media MIME type, when carried at the part level. */
	mimeType?: unknown;
}

/** A tool result surfaced within a chat event's content (paired to a call by id). */
export interface ChatEventToolResult
{
	/** The tool-call id this result belongs to, when carried. */
	id: string | undefined;
	/** The rendered output text. */
	output: string;
	/** Whether the result is an error. */
	isError: boolean;
}

/** A media attachment surfaced within a chat event's content. */
export interface ChatEventAttachment
{
	/** Attachment URL (http(s), data:, or app-relative). */
	url: string;
	/** Media family. */
	kind: "image" | "audio" | "video" | "document";
	/** Display label. */
	label: string;
	/** MIME type, when known. */
	mimeType?: string;
	/** Whether an audio attachment is a voice note. */
	isVoiceNote?: boolean;
}

/** The stable tool-call id of a part across snake/camel spellings, or undefined. */
function _toolId(part: ContentPart): string | undefined
{
	return part.id ?? part.tool_use_id ?? part.toolCallId ?? part.tool_call_id;
}

/** Flatten a tool_result `content` (string, or array of `{text}` / string parts) to text. */
function _toolResultText(content: unknown): string
{
	if (typeof content === "string")
	{
		return content;
	}
	if (Array.isArray(content))
	{
		return content
			.map((part) => (typeof part === "string" ? part : typeof (part as { text?: unknown })?.text === "string" ? (part as { text: string }).text : ""))
			.filter((t) => t.length > 0)
			.join("\n");
	}
	if (content !== undefined && content !== null)
	{
		try { return JSON.stringify(content); } catch { return ""; }
	}
	return "";
}

/** The typed content parts of a message object, or `[]` for a string/absent body. */
function _contentParts(ev: ChatEvent): ContentPart[]
{
	const content = _messageObject(ev)?.content;
	if (!Array.isArray(content))
	{
		return [];
	}
	return content.filter((part): part is ContentPart => part !== null && typeof part === "object");
}

/** A tool call surfaced within a chat event's content. */
export interface ChatEventTool
{
	/** Tool name. */
	name: string;
	/** One-line, human-readable argument preview (best-effort; may be empty). */
	detail: string;
	/** Stable tool-call id, when the event carries one (used to pair results). */
	id?: string;
}

/**
 * The rendered prose of a chat event.
 *
 * v2026.x carries `message.content` as an array of typed parts — only the `text`
 * parts are prose (reasoning/tool_use parts are surfaced separately by
 * {@link _ChatEventThinking}/{@link _ChatEventTools}) — or, tolerantly, a bare
 * string. The legacy form carries a string `message` snapshot or an incremental
 * `deltaText`. Returns `undefined` when there is no prose to apply (so the caller
 * keeps the prior value rather than blanking it).
 */
export function _ChatEventText(ev: ChatEvent): string | undefined
{
	// A `toolResult` message's content is the tool OUTPUT, not assistant prose — never render it
	// as a text bubble (it is surfaced on the tool card via _ChatEventToolResults instead).
	if (_ChatEventRole(ev) === "toolResult")
	{
		return undefined;
	}
	const obj = _messageObject(ev);
	if (obj)
	{
		const content = obj.content;
		if (typeof content === "string")
		{
			return content;
		}
		if (Array.isArray(content))
		{
			return _contentParts(ev)
				.filter((part) => part.type === undefined || part.type === "text")
				.map((part) => (typeof part.text === "string" ? part.text : ""))
				.join("");
		}
		return undefined;
	}
	const flat = (ev as { message?: unknown }).message;
	if (typeof flat === "string")
	{
		return flat;
	}
	return ev.deltaText;
}

/**
 * The assistant's reasoning ("thinking") text for a chat event, or `undefined`
 * when the frame carries none.
 *
 * Tolerant across provider shapes: Anthropic-style `{ type: "thinking", thinking }`
 * and openai-responses `{ type: "reasoning", text | summary }` parts are both read.
 * The thinking parts of a cumulative snapshot are joined in order.
 */
export function _ChatEventThinking(ev: ChatEvent): string | undefined
{
	const text = _contentParts(ev)
		.filter((part) => part.type === "thinking" || part.type === "reasoning")
		.map((part) => part.thinking ?? part.text ?? part.summary ?? "")
		.join("\n")
		.trim();
	return text.length > 0 ? text : undefined;
}

/**
 * The tool calls surfaced in a chat event's content (`{ type: "tool_use", name,
 * input }` parts), in order. Empty when the frame carries none. The `input` is
 * rendered to a compact one-line detail for display.
 */
export function _ChatEventTools(ev: ChatEvent): ChatEventTool[]
{
	// OpenClaw serves tool calls as `{ type: "toolCall", id, name, arguments }` content parts
	// (verified live); tolerate the generic `tool_use`/`tool_call` spellings + `args`/`input` too.
	return _contentParts(ev)
		.filter((part) => isToolCallContentType(part.type) && typeof part.name === "string")
		.map((part) => ({ name: part.name as string, detail: _formatToolInput(resolveToolBlockArgs(part as unknown as Record<string, unknown>)), ...(_toolId(part) ? { id: _toolId(part) } : {}) }));
}

/**
 * The tool RESULTS surfaced in a chat event's content (`{ type: "tool_result", tool_use_id,
 * content, is_error }` parts). Tool results usually arrive in a separate message from the
 * `tool_use` call, so these are paired back to a call by {@link ChatEventToolResult.id}. The
 * error flag is the explicit `is_error`/`isError`, else inferred from the output text.
 */
export function _ChatEventToolResults(ev: ChatEvent): ChatEventToolResult[]
{
	// OpenClaw's real shape: the result is its own `role: "toolResult"` message (message-level
	// toolCallId + content + isError). Prefer that; also read inline `tool_result` content parts
	// (generic providers) so both wire shapes surface.
	const messageResult = _messageToolResult(ev);
	const partResults = _contentParts(ev)
		.filter((part) => part.type === "tool_result")
		.map((part) =>
		{
			const output = _toolResultText(part.content);
			const explicit = part.is_error ?? part.isError;
			return { id: _toolId(part), output, isError: typeof explicit === "boolean" ? explicit : isToolErrorOutput(output) };
		});
	return messageResult ? [messageResult, ...partResults] : partResults;
}

/**
 * The media attachments surfaced in a chat event's content: structured `attachment` parts and
 * Anthropic-style `image`/`audio`/`video` parts (`{ source: { url | media_type+data } }`). Each
 * is classified into a media family with a display label via the shared render helpers.
 */
export function _ChatEventAttachments(ev: ChatEvent): ChatEventAttachment[]
{
	const out: ChatEventAttachment[] = [];
	for (const part of _contentParts(ev))
	{
		// Structured attachment part: trust its declared fields.
		if (part.type === "attachment" && part.attachment && typeof part.attachment.url === "string")
		{
			const a = part.attachment;
			const kind = a.kind === "image" || a.kind === "audio" || a.kind === "video" || a.kind === "document"
				? a.kind
				: mediaKindFromMime(typeof a.mimeType === "string" ? a.mimeType : undefined) ?? "document";
			out.push({
				url: a.url as string,
				kind,
				label: typeof a.label === "string" && a.label.trim() ? a.label.trim() : (a.url as string),
				...(typeof a.mimeType === "string" ? { mimeType: a.mimeType } : {}),
				...(a.isVoiceNote === true ? { isVoiceNote: true } : {}),
			});
			continue;
		}
		// Provider media part (image/audio/video) with a source url or base64 data.
		if (part.type === "image" || part.type === "audio" || part.type === "video")
		{
			const src = part.source;
			const media = typeof src?.media_type === "string" ? src.media_type : typeof part.mimeType === "string" ? part.mimeType : undefined;
			let url: string | undefined;
			if (typeof src?.url === "string")
			{
				url = src.url;
			}
			else if (typeof part.url === "string")
			{
				url = part.url;
			}
			else if (src?.type === "base64" && typeof src.data === "string" && media)
			{
				url = `data:${media};base64,${src.data}`;
			}
			if (!url)
			{
				continue;
			}
			const inferred = inferAttachmentKind(url);
			out.push({ url, kind: (part.type as "image" | "audio" | "video"), label: inferred.label, ...(media ? { mimeType: media } : inferred.mimeType ? { mimeType: inferred.mimeType } : {}) });
		}
	}
	return out;
}

/**
 * Extract the renderable prose, reasoning, and tool calls from a `chat.history`
 * row, reusing the live-event readers.
 *
 * A history row is shaped like a transcript message — assistant rows carry
 * `content` as the SAME typed-parts array a live `chat` event does (`[{ type,
 * text }]`), NOT a string. Reading it as a string (the old behaviour) dropped
 * every assistant reply from history. Wrapping the row as a pseudo event lets the
 * one set of content readers handle both paths identically. Falls back to a
 * string `text`/`content` for the legacy/flat shape.
 */
export function _HistoryRowContent(row: { role?: string; content?: unknown; text?: unknown; toolName?: unknown; tool_name?: unknown; message?: unknown }): { text: string; thinking: string | undefined; tools: ChatEventTool[]; toolResults: ChatEventToolResult[]; attachments: ChatEventAttachment[] }
{
	// Tolerate both flat rows (`{ role, content, … }`) and rows wrapped as `{ message: {…} }`
	// (OpenClaw's transcript shape), flattening so message-level fields (toolCallId/isError for a
	// `toolResult` message) survive into the pseudo event the readers consume.
	const raw: Record<string, unknown> = row.message && typeof row.message === "object"
		? { ...(row as Record<string, unknown>), ...(row.message as Record<string, unknown>) }
		: (row as Record<string, unknown>);
	const body = raw["content"] ?? raw["text"];
	const pseudo = { message: { ...raw, content: body } } as unknown as ChatEvent;
	const text = _ChatEventText(pseudo) ?? (typeof raw["text"] === "string" ? (raw["text"] as string) : "");
	const tools = _ChatEventTools(pseudo);
	const toolResults = _ChatEventToolResults(pseudo);
	// A tool CALL row can carry its name at the TOP level (`toolName`/`tool_name`) rather than as a
	// `tool_use` content part — surface that as a chip. But a `toolResult` row ALSO carries `toolName`
	// (the tool it is a RESULT for); it must stay a result-only carrier so it folds into its call
	// (see _FoldHistoryToolResults) instead of rendering as a spurious empty-args call card. So only
	// add the chip when the row carries no results.
	if (tools.length === 0 && toolResults.length === 0)
	{
		const topName = typeof raw["toolName"] === "string" ? (raw["toolName"] as string) : typeof raw["tool_name"] === "string" ? (raw["tool_name"] as string) : undefined;
		if (topName)
		{
			tools.push({ name: topName, detail: "" });
		}
	}
	return { text, thinking: _ChatEventThinking(pseudo), tools, toolResults, attachments: _ChatEventAttachments(pseudo) };
}

/** Render tool input arguments as a compact, single-line preview (best-effort). */
function _formatToolInput(input: unknown): string
{
	if (input === undefined || input === null)
	{
		return "";
	}
	if (typeof input === "string")
	{
		return input;
	}
	try
	{
		return JSON.stringify(input);
	}
	catch
	{
		return "";
	}
}

/** The role a chat event carries — object `message.role`, else the flat top-level `role`. */
export function _ChatEventRole(ev: ChatEvent): string | undefined
{
	return _messageObject(ev)?.role ?? ev.role;
}

/**
 * Whether the event closes the turn: an explicit `done`/`final` (legacy) OR a
 * non-empty `message.stopReason` (v2026.x, e.g. "stop"/"error"/"length").
 */
export function _ChatEventDone(ev: ChatEvent): boolean
{
	if (ev.done || ev.final)
	{
		return true;
	}
	const stop = _messageObject(ev)?.stopReason;
	return typeof stop === "string" && stop.length > 0;
}

/** The raw `stopReason` a v2026.x event carries, lower-cased, or undefined. */
export function _ChatEventStopReason(ev: ChatEvent): string | undefined
{
	const stop = _messageObject(ev)?.stopReason;
	return typeof stop === "string" && stop.length > 0 ? stop.toLowerCase() : undefined;
}

/**
 * How the turn ended, mapped from `stopReason` — so the UI tells a clean reply
 * apart from a truncated or errored one. Returns:
 *  - {@link MessageDelivery.Truncated} for "length"/"max_tokens",
 *  - {@link MessageDelivery.Error} for "error"/"failed"/"refusal",
 *  - `undefined` for a clean stop (no badge) or when the turn is not yet closed.
 */
export function _ChatEventDelivery(ev: ChatEvent): MessageDelivery | undefined
{
	const stop = _ChatEventStopReason(ev);
	if (stop === "length" || stop === "max_tokens" || stop === "max_output_tokens")
	{
		return MessageDelivery.Truncated;
	}
	if (stop === "error" || stop === "failed" || stop === "refusal")
	{
		return MessageDelivery.Error;
	}
	return undefined;
}

/**
 * Stable id for the turn this event belongs to: an explicit `messageId`, else the
 * `runId`/`idempotencyKey` the v2026.x gateway keys a turn by. `undefined` lets the
 * caller reuse the in-flight assistant id or mint a local one.
 */
export function _ChatEventId(ev: ChatEvent): string | undefined
{
	return ev.messageId ?? (ev as { runId?: string }).runId ?? (ev as { idempotencyKey?: string }).idempotencyKey ?? undefined;
}

/**
 * Whether the event's text is a cumulative SNAPSHOT (replace the message body) vs
 * an incremental delta to append. Any `message` (object or string) is a snapshot;
 * a bare `deltaText` appends unless `replace` is set.
 */
export function _ChatEventIsSnapshot(ev: ChatEvent): boolean
{
	return (ev as { message?: unknown }).message !== undefined || ev.replace === true;
}
