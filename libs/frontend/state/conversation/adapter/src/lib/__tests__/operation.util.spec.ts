import { describe, expect, it } from "vitest";

import { SessionOperationEvent } from "../gateway-protocol.types";
import { _OperationIsTerminal, _OperationLabel } from "../operation.util";

const ev = (o: Partial<SessionOperationEvent>): SessionOperationEvent => o as SessionOperationEvent;

describe("_OperationLabel", () =>
{
	it("prefers an explicit label", () =>
	{
		expect(_OperationLabel(ev({ label: "Compacting context", operation: "context.compaction" }))).toBe("Compacting context");
	});

	it("title-cases a dotted operation id", () =>
	{
		expect(_OperationLabel(ev({ operation: "context.compaction" }))).toBe("Context compaction");
	});

	it("appends a non-terminal phase", () =>
	{
		expect(_OperationLabel(ev({ operation: "indexing", phase: "scanning" }))).toBe("Indexing — scanning");
	});

	it("ignores a terminal phase in the label", () =>
	{
		expect(_OperationLabel(ev({ operation: "indexing", phase: "done" }))).toBe("Indexing");
	});

	it("returns undefined when there is nothing to show", () =>
	{
		expect(_OperationLabel(ev({}))).toBeUndefined();
	});
});

describe("_OperationIsTerminal", () =>
{
	it("is terminal on done:true", () =>
	{
		expect(_OperationIsTerminal(ev({ done: true }))).toBe(true);
	});

	it("is terminal on a terminal status or phase", () =>
	{
		expect(_OperationIsTerminal(ev({ status: "complete" }))).toBe(true);
		expect(_OperationIsTerminal(ev({ phase: "error" }))).toBe(true);
		expect(_OperationIsTerminal(ev({ status: "cancelled" }))).toBe(true);
	});

	it("is not terminal while running", () =>
	{
		expect(_OperationIsTerminal(ev({ status: "running" }))).toBe(false);
		expect(_OperationIsTerminal(ev({}))).toBe(false);
	});
});
