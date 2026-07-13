import { describe, expect, it } from "vitest";

import type { ThreadMessage } from "@opencrane/core";

import { _IsHistoryExhausted, _MergeLiveTail } from "../history.util";

/** Minimal message fixture. */
function _m(id: string): ThreadMessage
{
	return { id, role: "user", time: "10:00", cards: [] };
}

describe("_MergeLiveTail", () =>
{
	it("appends only locally-tracked tail messages after the fetched rows", () =>
	{
		const fetched = [_m("s1"), _m("s2")];
		const current = [_m("s1"), _m("s2"), _m("local-u-0"), _m("local-a-1")];
		const localIds = new Set(["local-u-0", "local-a-1"]);

		const merged = _MergeLiveTail(fetched, current, localIds);

		expect(merged.map((m) => m.id)).toEqual(["s1", "s2", "local-u-0", "local-a-1"]);
	});

	it("does not duplicate a server row even if its id resembles a local one", () =>
	{
		// Server id starts with "a" — a prefix heuristic would have mis-kept it.
		const fetched = [_m("a-server-row")];
		const current = [_m("a-server-row")];
		const localIds = new Set<string>();

		const merged = _MergeLiveTail(fetched, current, localIds);

		expect(merged.map((m) => m.id)).toEqual(["a-server-row"]);
	});

	it("returns just the fetched rows when there is no local tail", () =>
	{
		const merged = _MergeLiveTail([_m("s1")], [_m("s1")], new Set());
		expect(merged.map((m) => m.id)).toEqual(["s1"]);
	});
});

describe("_IsHistoryExhausted", () =>
{
	it("is not exhausted while growing the window keeps revealing new rows", () =>
	{
		expect(_IsHistoryExhausted(200, -1, 200, 1000)).toBe(false);
		expect(_IsHistoryExhausted(400, 200, 400, 1000)).toBe(false);
	});

	it("is exhausted when a grown window reveals no additional rows", () =>
	{
		expect(_IsHistoryExhausted(250, 250, 600, 1000)).toBe(true);
	});

	it("is exhausted at the hard ceiling regardless of row count", () =>
	{
		expect(_IsHistoryExhausted(1000, 800, 1000, 1000)).toBe(true);
	});

	it("does not treat a short first page as exhausted (maxChars-safe)", () =>
	{
		// First fetch returns fewer than the limit (truncation or small session),
		// but lastRowCount is -1 so it must not falsely flip to exhausted.
		expect(_IsHistoryExhausted(120, -1, 200, 1000)).toBe(false);
	});
});
