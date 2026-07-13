import { describe, expect, it } from "vitest";

import { MessageCardKind, ThreadMessage } from "@opencrane/core";

import { _FoldHistoryToolResults, _LocateToolResultTarget, HistoryBuilt } from "../assistant-cards.util";

/** An assistant message carrying one tool card (with a call-id), no output yet. */
function _assistantWithTool(id: string, callId: string): ThreadMessage
{
	return { id, role: "assistant", time: "", cards: [{ type: MessageCardKind.Tool, label: "search", id: callId }] };
}

/** A carrier entry: a row that only carries a tool result (belongs to an earlier call). */
function _carrier(callId: string, output: string, isError = false): HistoryBuilt
{
	return {
		message: { id: `r-${callId}`, role: "assistant", time: "", cards: [] },
		toolResults: [{ id: callId, output, isError }],
		isCarrier: true,
	};
}

/** A normal (non-carrier) entry. */
function _entry(message: ThreadMessage): HistoryBuilt
{
	return { message, toolResults: [], isCarrier: false };
}

describe("_FoldHistoryToolResults", () =>
{
	it("merges a tool-result carrier into the preceding assistant's tool card and drops the carrier", () =>
	{
		const folded = _FoldHistoryToolResults([
			_entry(_assistantWithTool("a1", "call-1")),
			_carrier("call-1", "the answer"),
		]);
		expect(folded).toHaveLength(1);
		const tool = folded[0].cards.find((c) => c.type === MessageCardKind.Tool);
		expect(tool?.output).toBe("the answer");
		expect(tool?.isError).toBe(false);
	});

	it("pairs by call-id across an interleaved user turn", () =>
	{
		const user: ThreadMessage = { id: "u", role: "user", time: "", cards: [{ type: MessageCardKind.Text, content: "hi" }] };
		const folded = _FoldHistoryToolResults([
			_entry(_assistantWithTool("a1", "call-1")),
			_entry(user),
			_carrier("call-1", "done"),
		]);
		// user + assistant survive; carrier folded into the assistant's tool card.
		expect(folded.map((m) => m.role)).toEqual(["assistant", "user"]);
		expect(folded[0].cards.find((c) => c.type === MessageCardKind.Tool)?.output).toBe("done");
	});

	it("drops a carrier that has no preceding assistant (unrenderable orphan result)", () =>
	{
		const folded = _FoldHistoryToolResults([_carrier("call-x", "orphan")]);
		expect(folded).toHaveLength(0);
	});

	it("marks the merged tool card as an error when the result is an error", () =>
	{
		const folded = _FoldHistoryToolResults([
			_entry(_assistantWithTool("a1", "call-1")),
			_carrier("call-1", "boom", true),
		]);
		expect(folded[0].cards.find((c) => c.type === MessageCardKind.Tool)?.isError).toBe(true);
	});

	it("pairs each carrier with its OWN call by id when calls were batched across earlier messages", () =>
	{
		// call-1 and call-2 arrive as separate messages BEFORE either result — the tail results must
		// pair back to their own call by id, not both collapse onto the last assistant.
		const folded = _FoldHistoryToolResults([
			_entry(_assistantWithTool("a1", "call-1")),
			_entry(_assistantWithTool("a2", "call-2")),
			_carrier("call-1", "first"),
			_carrier("call-2", "second"),
		]);
		expect(folded).toHaveLength(2);
		const t1 = folded[0].cards.find((c) => c.type === MessageCardKind.Tool);
		const t2 = folded[1].cards.find((c) => c.type === MessageCardKind.Tool);
		expect([t1?.id, t1?.output]).toEqual(["call-1", "first"]);
		expect([t2?.id, t2?.output]).toEqual(["call-2", "second"]);
	});
});

describe("_LocateToolResultTarget", () =>
{
	const msg = (id: string, callId: string): ThreadMessage => ({ id, role: "assistant", time: "", cards: [{ type: MessageCardKind.Tool, label: "t", id: callId }] });

	it("finds the message holding the matching call id, newest-first", () =>
	{
		const messages = [msg("a", "call-1"), msg("b", "call-2")];
		expect(_LocateToolResultTarget(messages, [{ id: "call-1", output: "x", isError: false }], -1)).toBe(0);
		expect(_LocateToolResultTarget(messages, [{ id: "call-2", output: "x", isError: false }], -1)).toBe(1);
	});

	it("returns the fallback when no id matches (or the result has no id)", () =>
	{
		const messages = [msg("a", "call-1")];
		expect(_LocateToolResultTarget(messages, [{ id: "nope", output: "x", isError: false }], 7)).toBe(7);
		expect(_LocateToolResultTarget(messages, [{ id: undefined, output: "x", isError: false }], 3)).toBe(3);
	});
});
