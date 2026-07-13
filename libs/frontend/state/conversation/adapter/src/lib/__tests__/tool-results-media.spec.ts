import { describe, expect, it } from "vitest";

import { MessageCard, MessageCardKind } from "@opencrane/core";

import { _ChatEventAttachments, _ChatEventText, _ChatEventToolResults, _ChatEventTools } from "../chat-event.util";
import { _BuildAssistantCards, _MergeToolResults } from "../assistant-cards.util";
import { ChatEvent } from "../gateway-protocol.types";

/** Wrap a v2026.x message content array as a chat event. */
function _ev(role: string, content: unknown): ChatEvent
{
	return { message: { role, content } } as unknown as ChatEvent;
}

/** Wrap a full message object (extra message-level fields) as a chat event. */
function _msgEv(message: Record<string, unknown>): ChatEvent
{
	return { message } as unknown as ChatEvent;
}

describe("_ChatEventTools — OpenClaw real shape (toolCall + arguments)", () =>
{
	it("extracts a `toolCall` content part with camelCase args + id", () =>
	{
		const tools = _ChatEventTools(_ev("assistant", [
			{ type: "toolCall", id: "call_1", name: "get_goal", arguments: { q: "x" } },
		]));
		expect(tools).toEqual([{ name: "get_goal", detail: JSON.stringify({ q: "x" }), id: "call_1" }]);
	});
});

describe("_ChatEventToolResults / _ChatEventText — OpenClaw `role:toolResult` message", () =>
{
	const toolResultMsg = { role: "toolResult", toolCallId: "call_1", toolName: "get_goal", isError: false, content: [{ type: "text", text: '{"status":"ok"}' }] };

	it("reads the message-level toolResult (id from toolCallId, output from content text)", () =>
	{
		expect(_ChatEventToolResults(_msgEv(toolResultMsg))).toEqual([{ id: "call_1", output: '{"status":"ok"}', isError: false }]);
	});

	it("honours the message-level isError flag", () =>
	{
		expect(_ChatEventToolResults(_msgEv({ ...toolResultMsg, isError: true }))[0].isError).toBe(true);
	});

	it("never leaks a toolResult message's content as assistant prose", () =>
	{
		expect(_ChatEventText(_msgEv(toolResultMsg))).toBeUndefined();
	});
});

describe("_ChatEventToolResults", () =>
{
	it("extracts tool_result parts with id, output text, and explicit error flag", () =>
	{
		const results = _ChatEventToolResults(_ev("user", [
			{ type: "tool_result", tool_use_id: "call-1", content: "done", is_error: false },
			{ type: "tool_result", toolCallId: "call-2", content: [{ type: "text", text: "boom" }], is_error: true },
		]));
		expect(results).toEqual([
			{ id: "call-1", output: "done", isError: false },
			{ id: "call-2", output: "boom", isError: true },
		]);
	});

	it("infers the error flag from the output when not explicit", () =>
	{
		const results = _ChatEventToolResults(_ev("tool", [
			{ type: "tool_result", id: "c", content: JSON.stringify({ error: "nope" }) },
		]));
		expect(results[0].isError).toBe(true);
	});
});

describe("_ChatEventAttachments", () =>
{
	it("reads a structured attachment part", () =>
	{
		const atts = _ChatEventAttachments(_ev("assistant", [
			{ type: "attachment", attachment: { url: "/media/a.pdf", kind: "document", label: "a.pdf" } },
		]));
		expect(atts).toEqual([{ url: "/media/a.pdf", kind: "document", label: "a.pdf" }]);
	});

	it("reads an Anthropic image part from a source url", () =>
	{
		const atts = _ChatEventAttachments(_ev("assistant", [
			{ type: "image", source: { url: "https://x/pic.png" } },
		]));
		expect(atts[0]).toMatchObject({ url: "https://x/pic.png", kind: "image" });
	});

	it("builds a data URI from a base64 image source", () =>
	{
		const atts = _ChatEventAttachments(_ev("assistant", [
			{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
		]));
		expect(atts[0].url).toBe("data:image/png;base64,AAAA");
		expect(atts[0].kind).toBe("image");
	});
});

describe("_MergeToolResults", () =>
{
	const toolCard = (id: string): MessageCard => ({ type: MessageCardKind.Tool, label: "search", id });

	it("fills the matching tool card's output/isError by id", () =>
	{
		const merged = _MergeToolResults([toolCard("c1"), toolCard("c2")], [{ id: "c2", output: "hit", isError: false }]);
		expect(merged.find((c) => c.id === "c2")?.output).toBe("hit");
		expect(merged.find((c) => c.id === "c1")?.output).toBeUndefined();
	});

	it("falls back to the first result-less tool card when no id matches", () =>
	{
		const merged = _MergeToolResults([toolCard("c1")], [{ id: undefined, output: "x", isError: true }]);
		expect(merged[0].output).toBe("x");
		expect(merged[0].isError).toBe(true);
	});
});

describe("_BuildAssistantCards — results + attachments", () =>
{
	it("preserves a merged tool result across a cumulative snapshot re-render", () =>
	{
		const first = _BuildAssistantCards([], {
			text: "", thinking: undefined, tools: [{ name: "search", detail: "q", id: "c1" }],
			toolResults: [{ id: "c1", output: "done", isError: false }], attachments: [], isSnapshot: true,
		});
		// A later snapshot restates the same turn/call but carries NO result — output must survive.
		const second = _BuildAssistantCards(first, {
			text: "more", thinking: undefined, tools: [{ name: "search", detail: "q", id: "c1" }],
			toolResults: [], attachments: [], isSnapshot: true,
		});
		expect(second.find((c) => c.type === MessageCardKind.Tool)?.output).toBe("done");
	});

	it("attaches inline tool output to the tool card and appends attachment cards", () =>
	{
		const cards = _BuildAssistantCards([], {
			text: "here",
			thinking: undefined,
			tools: [{ name: "search", detail: "q", id: "c1" }],
			toolResults: [{ id: "c1", output: "found", isError: false }],
			attachments: [{ url: "/m/a.mp3", kind: "audio", label: "a.mp3" }],
			isSnapshot: true,
		});
		const tool = cards.find((c) => c.type === MessageCardKind.Tool);
		expect(tool?.output).toBe("found");
		expect(cards.some((c) => c.type === MessageCardKind.Attachment && c.attachmentKind === "audio")).toBe(true);
	});
});
