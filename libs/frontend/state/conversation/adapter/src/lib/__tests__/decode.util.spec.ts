import { describe, expect, it } from "vitest";

import { _DecodeAgentList, _DecodeHealth, _DecodeModelList, _DecodeSessionOperation, _DecodeShutdown } from "../openclaw-connection";

describe("_DecodeModelList", () =>
{
	it("unwraps the `models` array", () =>
	{
		const rows = _DecodeModelList({ models: [{ id: "claude-sonnet-4-6", name: "Sonnet 4.6", provider: "anthropic" }] });
		expect(rows).toEqual([{ id: "claude-sonnet-4-6", name: "Sonnet 4.6", provider: "anthropic" }]);
	});

	it("tolerates a bare array and a missing envelope", () =>
	{
		expect(_DecodeModelList([{ id: "m1" }])).toEqual([{ id: "m1" }]);
		expect(_DecodeModelList({})).toEqual([]);
		expect(_DecodeModelList(null)).toEqual([]);
	});
});

describe("_DecodeAgentList", () =>
{
	it("unwraps the `agents` array", () =>
	{
		expect(_DecodeAgentList({ agents: [{ id: "main", name: "Assistant" }] })).toEqual([{ id: "main", name: "Assistant" }]);
	});

	it("returns empty for a non-list payload", () =>
	{
		expect(_DecodeAgentList({ agents: "nope" })).toEqual([]);
	});
});

describe("lifecycle event decoders", () =>
{
	it("accepts a session.operation payload", () =>
	{
		expect(_DecodeSessionOperation({ operation: "context.compaction", status: "running" })).not.toBeNull();
	});

	it("accepts a health payload", () =>
	{
		expect(_DecodeHealth({ ok: false, status: "degraded" })).not.toBeNull();
	});

	it("accepts a shutdown payload", () =>
	{
		expect(_DecodeShutdown({ reason: "redeploy" })).not.toBeNull();
		expect(_DecodeShutdown({})).not.toBeNull();
	});
});
