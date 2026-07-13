import { MessageCardKind, ThreadMessage } from "@opencrane/core";

import { StreamBlock } from "./conversation-stream.types";

/** Whether a message is purely tool activity — an assistant turn of tool call(s) with no prose. */
function _isToolOnlyMessage(message: ThreadMessage): boolean
{
	if (message.role !== "assistant")
	{
		return false;
	}
	let hasTool = false;
	for (const card of message.cards)
	{
		if (card.type === MessageCardKind.Tool)
		{
			hasTool = true;
			continue;
		}
		// An empty prose card is the snapshot builder's trailing placeholder — ignore it.
		if (card.type === MessageCardKind.Text && (card.content ?? "").trim().length === 0)
		{
			continue;
		}
		return false;
	}
	return hasTool;
}

/**
 * Fold a message list into stream blocks: runs of consecutive tool-only assistant messages
 * coalesce into one "tools" block so a whole agentic step (many messages, one tool call each)
 * renders as a single grouped disclosure. Everything else passes through as a "message" block.
 * Pure — the view maps the result to components; the draft/blank policy stays in the view.
 */
export function _BuildStreamBlocks(messages: readonly ThreadMessage[]): StreamBlock[]
{
	const blocks: StreamBlock[] = [];
	let run: { tools: StreamBlock["tools"]; id: string; time: string } | null = null;
	function flush(): void
	{
		if (run)
		{
			blocks.push({ kind: "tools", id: `tools:${run.id}`, tools: run.tools, time: run.time });
			run = null;
		}
	}
	for (const message of messages)
	{
		if (_isToolOnlyMessage(message))
		{
			const tools = message.cards.filter((card) => card.type === MessageCardKind.Tool);
			if (run && run.tools)
			{
				run.tools.push(...tools);
				run.time = message.time || run.time;
			}
			else
			{
				run = { tools: [...tools], id: message.id, time: message.time };
			}
			continue;
		}
		flush();
		blocks.push({ kind: "message", id: message.id, message });
	}
	flush();
	return blocks;
}
