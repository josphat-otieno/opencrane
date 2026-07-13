import { MessageCard, MessageCardKind, ThreadMessage } from "@opencrane/core";

import { ChatEventAttachment, ChatEventTool, ChatEventToolResult } from "./chat-event.util";

/**
 * Pure builders for an assistant message's card stack — the reasoning
 * ("thinking") disclosure, one chip per tool call, and the prose body. Kept out
 * of the gateway and exported so the card-ordering rules are unit-tested directly.
 */

/** The card-shaping inputs read from one `chat` event. */
export interface AssistantCardUpdate
{
	/** Prose body (undefined keeps the prior body). */
	text: string | undefined;
	/** Reasoning text, when the event carries any. */
	thinking: string | undefined;
	/** Tool calls surfaced in the event content. */
	tools: ChatEventTool[];
	/** Tool results surfaced in the event content (paired into tool cards by id). */
	toolResults?: ChatEventToolResult[];
	/** Media attachments surfaced in the event content. */
	attachments?: ChatEventAttachment[];
	/** Whether the event is a cumulative snapshot (replace) vs a delta (append). */
	isSnapshot: boolean;
}

/**
 * Build a Tool card from a chat-event tool call (carrying its id for result pairing). A `prior`
 * card (matched from the previous render) carries over live state a cumulative snapshot would
 * otherwise wipe — the session.tool `status` AND an already-merged result (`output`/`isError`),
 * so re-rendering the turn never drops a tool's output.
 */
function _toolCard(tool: ChatEventTool, prior?: MessageCard): MessageCard
{
	return {
		type: MessageCardKind.Tool,
		label: tool.name,
		content: tool.detail.length > 0 ? tool.detail : undefined,
		...(tool.id ? { id: tool.id } : {}),
		...(prior?.status ? { status: prior.status } : {}),
		...(prior?.output !== undefined ? { output: prior.output } : {}),
		...(prior?.isError !== undefined ? { isError: prior.isError } : {}),
	};
}

/** Build an Attachment card from a chat-event attachment. */
function _attachmentCard(a: ChatEventAttachment): MessageCard
{
	return {
		type: MessageCardKind.Attachment,
		attachmentUrl: a.url,
		attachmentKind: a.kind,
		attachmentLabel: a.label,
		...(a.mimeType ? { mimeType: a.mimeType } : {}),
		...(a.isVoiceNote ? { isVoiceNote: true } : {}),
	};
}

/**
 * Merge tool results into a card stack: fill the matching Tool card's `output`/`isError`
 * (by tool-call id, else the first result-less Tool card with the same label, else the first
 * result-less Tool card). Returns a new array; unmatched results are ignored (their call may
 * not be in this window yet). Used both in the snapshot rebuild and when a result arrives in a
 * later live event than its call.
 */
export function _MergeToolResults(cards: MessageCard[], results: ChatEventToolResult[]): MessageCard[]
{
	if (results.length === 0)
	{
		return cards;
	}
	const next = cards.map((card) => ({ ...card }));
	for (const result of results)
	{
		let target = result.id ? next.find((c) => c.type === MessageCardKind.Tool && c.id === result.id) : undefined;
		if (!target)
		{
			target = next.find((c) => c.type === MessageCardKind.Tool && c.output === undefined);
		}
		if (target)
		{
			target.output = result.output;
			target.isError = result.isError;
		}
	}
	return next;
}

/** Whether a message carries a Tool card with the given tool-call id. */
function _messageHoldsToolCall(message: ThreadMessage, id: string): boolean
{
	return message.cards.some((card) => card.type === MessageCardKind.Tool && card.id === id);
}

/**
 * The index of the message that should receive `results`: the one already holding a Tool card
 * whose id matches a result (searched newest-first across ALL messages), else `fallback`. This
 * pairs a tool RESULT with its CALL by id even when the call landed in an EARLIER message than the
 * result — an agent that batches several tool calls before their results emits each as its own
 * message, so scoping the search to a single message left the later results as orphan cards.
 */
export function _LocateToolResultTarget(messages: ThreadMessage[], results: ChatEventToolResult[], fallback: number): number
{
	const ids = results.map((result) => result.id).filter((id): id is string => id !== undefined);
	if (ids.length > 0)
	{
		for (let index = messages.length - 1; index >= 0; index--)
		{
			if (ids.some((id) => _messageHoldsToolCall(messages[index], id)))
			{
				return index;
			}
		}
	}
	return fallback;
}

/** The prose of the (single) text card in a card list, or "" when absent. */
function _textOf(cards: MessageCard[]): string
{
	return cards.find((card) => card.type === MessageCardKind.Text)?.content ?? "";
}

/**
 * Whether a card stack has anything worth rendering — non-empty prose, or any
 * thinking/tool/ledger/image card. Used to drop the empty assistant rows a
 * history projection can include (announce/system/redacted-only turns) so they
 * don't render as blank bubbles.
 */
export function _HasRenderableCards(cards: MessageCard[]): boolean
{
	return cards.some((card) => card.type === MessageCardKind.Text ? (card.content ?? "").trim().length > 0 : true);
}

/**
 * Rebuild an assistant message's cards from a chat event.
 *
 * A cumulative snapshot restates the whole turn, so the card stack is rebuilt in
 * reading order — reasoning first, then one chip per tool call, then the prose —
 * carrying over any live status a `session.tool` event set on a matching tool. A
 * legacy delta only appends to the prose card and preserves the existing
 * reasoning/tool cards. Missing prose keeps the prior body rather than blanking it.
 */
export function _BuildAssistantCards(existing: MessageCard[], update: AssistantCardUpdate): MessageCard[]
{
	const previous = _textOf(existing);
	const body = update.text === undefined
		? previous
		: update.isSnapshot ? update.text : previous + update.text;
	const textCard: MessageCard = { type: MessageCardKind.Text, content: body };

	if (!update.isSnapshot)
	{
		const preserved = existing.filter((card) => card.type !== MessageCardKind.Text);
		const merged = _MergeToolResults(preserved, update.toolResults ?? []);
		const appended = (update.attachments ?? []).map(_attachmentCard);
		return [...merged, ...appended, textCard];
	}

	const priorTools = existing.filter((card) => card.type === MessageCardKind.Tool);
	const cards: MessageCard[] = [];
	if (update.thinking)
	{
		cards.push({ type: MessageCardKind.Thinking, content: update.thinking });
	}
	for (const tool of update.tools)
	{
		// Carry over prior live state (session.tool status + an already-merged result), matched
		// by id then name, so a cumulative snapshot re-render never drops a tool's output/status.
		const prior = priorTools.find((card) => (tool.id && card.id === tool.id) || card.label === tool.name);
		cards.push(_toolCard(tool, prior));
	}
	for (const attachment of update.attachments ?? [])
	{
		cards.push(_attachmentCard(attachment));
	}
	cards.push(textCard);
	return _MergeToolResults(cards, update.toolResults ?? []);
}

/**
 * Merge a `session.tool` status ping into an assistant message's cards: update a
 * matching Tool card's status in place, or insert a new Tool card just before the
 * prose so tools read above the reply.
 */
export function _MergeToolCard(cards: MessageCard[], name: string, status: string | undefined): MessageCard[]
{
	const index = cards.findIndex((card) => card.type === MessageCardKind.Tool && card.label === name);
	if (index >= 0)
	{
		const copy = [...cards];
		copy[index] = { ...copy[index], status };
		return copy;
	}
	const toolCard: MessageCard = { type: MessageCardKind.Tool, label: name, status };
	const textAt = cards.findIndex((card) => card.type === MessageCardKind.Text);
	if (textAt < 0)
	{
		return [...cards, toolCard];
	}
	return [...cards.slice(0, textAt), toolCard, ...cards.slice(textAt)];
}

/** A mapped history row + the metadata needed to fold tool-result rows into their call. */
export interface HistoryBuilt
{
	/** The message this row maps to (assistant or user). */
	message: ThreadMessage;
	/** Tool results carried by the row (used when it is a carrier). */
	toolResults: ChatEventToolResult[];
	/**
	 * Whether the row is a standalone tool-RESULT carrier (results but no call, prose, or
	 * media) — its results belong to a tool_use in an EARLIER assistant row, not to itself.
	 */
	isCarrier: boolean;
}

/**
 * Fold a mapped history sequence so a tool RESULT that arrived in its own row is merged into
 * the preceding assistant message's matching tool card (by call-id), and the standalone carrier
 * row is dropped. Openclaw emits `tool_use` in the assistant turn and the `tool_result` in a
 * separate later message, so without this the result row renders as an empty bubble (dropped) and
 * the tool card never shows its output. A carrier with no preceding assistant is discarded (a
 * result with no visible call is not renderable).
 *
 * @param built - The rows in transcript order, each already mapped + classified.
 * @returns The folded message list (carriers removed, their outputs merged upward).
 */
export function _FoldHistoryToolResults(built: HistoryBuilt[]): ThreadMessage[]
{
	const out: ThreadMessage[] = [];
	let lastAssistant = -1;
	for (const entry of built)
	{
		if (entry.isCarrier)
		{
			// Pair by call-id across ALL prior messages (not just the last assistant), so a result
			// whose call was batched into an earlier message still folds into that call.
			const target = _LocateToolResultTarget(out, entry.toolResults, lastAssistant);
			if (target >= 0)
			{
				out[target] = { ...out[target], cards: _MergeToolResults(out[target].cards, entry.toolResults) };
			}
			continue;
		}
		out.push(entry.message);
		if (entry.message.role === "assistant")
		{
			lastAssistant = out.length - 1;
		}
	}
	return out;
}
