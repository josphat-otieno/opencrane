import { describe, expect, it } from "vitest";

import { MessageCard, MessageCardKind, ThreadMessage } from "@opencrane/core";

import { _BuildStreamBlocks } from "../conversation-stream.util";

/** A minimal assistant message carrying the given cards. */
function _assistant(id: string, cards: MessageCard[], time = "12:00"): ThreadMessage
{
	return { id, role: "assistant", time, cards };
}

/** A user message with a text card. */
function _user(id: string, text: string): ThreadMessage
{
	return { id, role: "user", time: "12:00", cards: [{ type: MessageCardKind.Text, content: text }] };
}

const _tool = (label: string): MessageCard => ({ type: MessageCardKind.Tool, label });
const _text = (content: string): MessageCard => ({ type: MessageCardKind.Text, content });

describe("_BuildStreamBlocks", () =>
{
	it("coalesces consecutive tool-only messages into one tools block", () =>
	{
		const blocks = _BuildStreamBlocks([
			_assistant("a", [_tool("read")]),
			_assistant("b", [_tool("exec")]),
			_assistant("c", [_tool("read")], "12:05")
		]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].kind).toBe("tools");
		expect(blocks[0].tools?.map((t) => t.label)).toEqual(["read", "exec", "read"]);
		expect(blocks[0].id).toBe("tools:a");
		expect(blocks[0].time).toBe("12:05");
	});

	it("treats a trailing empty prose card as tool-only (snapshot placeholder)", () =>
	{
		const blocks = _BuildStreamBlocks([_assistant("a", [_tool("read"), _text("  ")])]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].kind).toBe("tools");
	});

	it("breaks a tool run on an intervening prose message", () =>
	{
		const blocks = _BuildStreamBlocks([
			_assistant("a", [_tool("read")]),
			_assistant("b", [_text("Here is what I found")]),
			_assistant("c", [_tool("exec")])
		]);
		expect(blocks.map((b) => b.kind)).toEqual(["tools", "message", "tools"]);
		expect(blocks[0].tools).toHaveLength(1);
		expect(blocks[2].tools).toHaveLength(1);
	});

	it("passes user and prose messages through as message blocks", () =>
	{
		const blocks = _BuildStreamBlocks([_user("u", "hi"), _assistant("a", [_text("hello")])]);
		expect(blocks.map((b) => b.kind)).toEqual(["message", "message"]);
		expect(blocks[0].message?.id).toBe("u");
	});

	it("does not group a mixed prose+tool message (left to per-message grouping)", () =>
	{
		const blocks = _BuildStreamBlocks([_assistant("a", [_text("let me check"), _tool("read")])]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].kind).toBe("message");
	});

	it("returns an empty list for no messages", () =>
	{
		expect(_BuildStreamBlocks([])).toEqual([]);
	});
});
