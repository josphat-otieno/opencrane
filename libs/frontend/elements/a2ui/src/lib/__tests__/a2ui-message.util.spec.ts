import { describe, expect, it } from "vitest";

import { _ParseA2uiMessages } from "../a2ui-message.util";

describe("_ParseA2uiMessages", () =>
{
	it("parses JSONL (one action per line), skipping blanks", () =>
	{
		const raw = '{"action":"createSurface","surfaceId":"s1"}\n\n{"action":"beginRendering","surfaceId":"s1"}';
		expect(_ParseA2uiMessages(raw)).toEqual([
			{ action: "createSurface", surfaceId: "s1" },
			{ action: "beginRendering", surfaceId: "s1" },
		]);
	});

	it("parses a whole-payload JSON array", () =>
	{
		const raw = '[{"action":"createSurface","surfaceId":"s1"},{"action":"deleteSurface","surfaceId":"s1"}]';
		expect(_ParseA2uiMessages(raw)).toHaveLength(2);
	});

	it("passes through an already-parsed array (objects only)", () =>
	{
		expect(_ParseA2uiMessages([{ action: "x" }, 5, null])).toEqual([{ action: "x" }]);
	});

	it("skips malformed JSONL lines rather than dropping the stream", () =>
	{
		const raw = '{"action":"createSurface"}\nnot json\n{"action":"beginRendering"}';
		expect(_ParseA2uiMessages(raw)).toEqual([{ action: "createSurface" }, { action: "beginRendering" }]);
	});

	it("returns [] for empty / non-string / non-array input", () =>
	{
		expect(_ParseA2uiMessages("")).toEqual([]);
		expect(_ParseA2uiMessages(undefined)).toEqual([]);
		expect(_ParseA2uiMessages(42)).toEqual([]);
	});
});
