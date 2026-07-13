import { describe, expect, it } from "vitest";

import { MessageDelivery } from "@opencrane/core";

import { _DecodeChatEvent } from "../openclaw-connection";
import { _ChatEventDelivery, _ChatEventDone, _ChatEventId, _ChatEventIsSnapshot, _ChatEventRole, _ChatEventStopReason, _ChatEventText, _ChatEventThinking, _ChatEventTools, _HistoryRowContent } from "../chat-event.util";
import { ChatEvent } from "../gateway-protocol.types";

/**
 * A verbatim `chat` event payload captured from a live openclaw@2026.6.9 gateway
 * (org-admin Control-UI socket). The cumulative message is an OBJECT with a typed
 * `content[]` array and a `stopReason` — the shape the old string-only schema
 * rejected, so the reply was dropped and never rendered.
 */
const LIVE_FRAME_PAYLOAD = {
	runId: "idem-s-06ae9f82-56be-41d6-81c3-63b38efc7c13-1782919649796-0",
	message: {
		role: "assistant",
		content: [{ type: "text", text: "⚠️ Agent failed before reply: No API key found for provider \"openai\"." }],
		timestamp: 1782919650391,
		stopReason: "stop",
		api: "openai-responses",
		model: "gateway-injected",
		provider: "openclaw",
		usage: { input: 0, output: 0, totalTokens: 0 }
	},
	idempotencyKey: "idem-s-06ae9f82-56be-41d6-81c3-63b38efc7c13-1782919649796-0",
	seq: 1
};

describe("chat event decode + readers", () =>
{
	it("decodes the live v2026.x object-message frame (previously dropped)", () =>
	{
		const ev = _DecodeChatEvent(LIVE_FRAME_PAYLOAD);
		expect(ev).not.toBeNull();
	});

	it("extracts text from message.content[].text", () =>
	{
		const ev = _DecodeChatEvent(LIVE_FRAME_PAYLOAD) as ChatEvent;
		expect(_ChatEventText(ev)).toBe("⚠️ Agent failed before reply: No API key found for provider \"openai\".");
	});

	it("reads role, id and done from the object shape", () =>
	{
		const ev = _DecodeChatEvent(LIVE_FRAME_PAYLOAD) as ChatEvent;
		expect(_ChatEventRole(ev)).toBe("assistant");
		expect(_ChatEventId(ev)).toBe(LIVE_FRAME_PAYLOAD.runId);
		expect(_ChatEventDone(ev)).toBe(true); // non-empty stopReason closes the turn
		expect(_ChatEventIsSnapshot(ev)).toBe(true); // object message is a cumulative snapshot
	});

	it("joins multiple text parts and ignores non-text parts", () =>
	{
		const ev = { message: { role: "assistant", content: [
			{ type: "text", text: "Hello " },
			{ type: "tool_use", name: "search" },
			{ type: "text", text: "world" }
		] } } as unknown as ChatEvent;
		expect(_ChatEventText(ev)).toBe("Hello world");
	});

	it("still supports the legacy flat delta stream", () =>
	{
		const delta = { deltaText: "par", role: "assistant" } as unknown as ChatEvent;
		expect(_ChatEventText(delta)).toBe("par");
		expect(_ChatEventIsSnapshot(delta)).toBe(false); // bare delta appends
		expect(_ChatEventDone(delta)).toBe(false);

		const final = { deltaText: "tial", done: true, role: "assistant" } as unknown as ChatEvent;
		expect(_ChatEventDone(final)).toBe(true);

		const stringSnapshot = { message: "full reply", final: true } as unknown as ChatEvent;
		expect(_ChatEventText(stringSnapshot)).toBe("full reply");
		expect(_ChatEventIsSnapshot(stringSnapshot)).toBe(true);
	});

	it("treats an in-progress object message (no stopReason) as not done", () =>
	{
		const streaming = { runId: "r1", message: { role: "assistant", content: [{ type: "text", text: "typing" }], stopReason: null } } as unknown as ChatEvent;
		expect(_ChatEventDone(streaming)).toBe(false);
		expect(_ChatEventText(streaming)).toBe("typing");
	});

	it("extracts reasoning from thinking / reasoning parts", () =>
	{
		const anthropic = { message: { role: "assistant", content: [{ type: "thinking", thinking: "let me check" }, { type: "text", text: "answer" }] } } as unknown as ChatEvent;
		expect(_ChatEventThinking(anthropic)).toBe("let me check");
		expect(_ChatEventText(anthropic)).toBe("answer"); // thinking is not folded into prose

		const responses = { message: { role: "assistant", content: [{ type: "reasoning", text: "step one" }] } } as unknown as ChatEvent;
		expect(_ChatEventThinking(responses)).toBe("step one");
	});

	it("returns no reasoning when there are no thinking parts", () =>
	{
		const ev = { message: { role: "assistant", content: [{ type: "text", text: "hi" }] } } as unknown as ChatEvent;
		expect(_ChatEventThinking(ev)).toBeUndefined();
	});

	it("extracts tool calls with a compact input preview", () =>
	{
		const ev = { message: { role: "assistant", content: [
			{ type: "tool_use", name: "search", input: { q: "policy" } },
			{ type: "text", text: "done" }
		] } } as unknown as ChatEvent;
		expect(_ChatEventTools(ev)).toEqual([{ name: "search", detail: "{\"q\":\"policy\"}" }]);
		expect(_ChatEventText(ev)).toBe("done"); // tool_use is not folded into prose
	});

	it("returns no tools when there are none", () =>
	{
		const ev = { message: { role: "assistant", content: [{ type: "text", text: "hi" }] } } as unknown as ChatEvent;
		expect(_ChatEventTools(ev)).toEqual([]);
	});

	it("reads a lower-cased stopReason", () =>
	{
		const ev = { message: { role: "assistant", content: [], stopReason: "LENGTH" } } as unknown as ChatEvent;
		expect(_ChatEventStopReason(ev)).toBe("length");
	});

	it("extracts assistant history rows whose content is a typed-parts array", () =>
	{
		// The shape that was rendering blank: assistant rows carry content[] like a live event.
		const assistant = _HistoryRowContent({ role: "assistant", content: [
			{ type: "thinking", thinking: "recall" },
			{ type: "tool_use", name: "search", input: { q: "x" } },
			{ type: "text", text: "The answer." }
		] });
		expect(assistant.text).toBe("The answer.");
		expect(assistant.thinking).toBe("recall");
		expect(assistant.tools).toEqual([{ name: "search", detail: "{\"q\":\"x\"}" }]);
	});

	it("extracts user history rows from a string content or text", () =>
	{
		expect(_HistoryRowContent({ role: "user", content: "hi there" }).text).toBe("hi there");
		expect(_HistoryRowContent({ role: "user", text: "flat text" }).text).toBe("flat text");
		expect(_HistoryRowContent({ role: "assistant" }).text).toBe(""); // nothing to show
	});

	it("surfaces a top-level tool name on a history tool row", () =>
	{
		expect(_HistoryRowContent({ role: "assistant", toolName: "web_search" }).tools).toEqual([{ name: "web_search", detail: "" }]);
		expect(_HistoryRowContent({ role: "tool", tool_name: "fetch" }).tools).toEqual([{ name: "fetch", detail: "" }]);
	});

	it("does NOT surface a toolResult row's toolName as a call chip (it stays a result-only carrier)", () =>
	{
		// A `toolResult` row carries `toolName` (the tool it is a RESULT for) plus the output. The
		// top-level-name fallback must not fire here, or the result renders as a spurious empty-args
		// tool card AND fails to fold into its real call (leaving an orphan "empty read").
		const row = _HistoryRowContent({ role: "toolResult", toolName: "read", toolCallId: "call-9", content: [{ type: "text", text: "file body" }] });
		expect(row.tools).toEqual([]);
		expect(row.toolResults).toEqual([{ id: "call-9", output: "file body", isError: false }]);
	});

	it("maps stopReason to a delivery outcome", () =>
	{
		const clean = { message: { role: "assistant", content: [], stopReason: "stop" } } as unknown as ChatEvent;
		const truncated = { message: { role: "assistant", content: [], stopReason: "length" } } as unknown as ChatEvent;
		const maxTokens = { message: { role: "assistant", content: [], stopReason: "max_tokens" } } as unknown as ChatEvent;
		const errored = { message: { role: "assistant", content: [], stopReason: "error" } } as unknown as ChatEvent;
		const streaming = { message: { role: "assistant", content: [], stopReason: null } } as unknown as ChatEvent;
		expect(_ChatEventDelivery(clean)).toBeUndefined(); // clean stop = no badge
		expect(_ChatEventDelivery(truncated)).toBe(MessageDelivery.Truncated);
		expect(_ChatEventDelivery(maxTokens)).toBe(MessageDelivery.Truncated);
		expect(_ChatEventDelivery(errored)).toBe(MessageDelivery.Error);
		expect(_ChatEventDelivery(streaming)).toBeUndefined(); // still streaming
	});
});
