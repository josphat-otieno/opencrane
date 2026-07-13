import { describe, expect, it } from "vitest";

import { MessageCard, MessageCardKind } from "@opencrane/core";

import { _BuildAssistantCards, _HasRenderableCards, _MergeToolCard } from "../assistant-cards.util";

describe("_BuildAssistantCards", () =>
{
	it("orders a snapshot as thinking → tools → prose", () =>
	{
		const cards = _BuildAssistantCards([], {
			text: "Here is the answer.",
			thinking: "weighing options",
			tools: [{ name: "search", detail: "{\"q\":\"x\"}" }],
			isSnapshot: true
		});
		expect(cards.map((c) => c.type)).toEqual([MessageCardKind.Thinking, MessageCardKind.Tool, MessageCardKind.Text]);
		expect(cards[0].content).toBe("weighing options");
		expect(cards[1]).toMatchObject({ label: "search", content: "{\"q\":\"x\"}" });
		expect(cards[2].content).toBe("Here is the answer.");
	});

	it("omits the thinking card when there is no reasoning", () =>
	{
		const cards = _BuildAssistantCards([], { text: "hi", thinking: undefined, tools: [], isSnapshot: true });
		expect(cards.map((c) => c.type)).toEqual([MessageCardKind.Text]);
	});

	it("replaces the body on each cumulative snapshot", () =>
	{
		const first = _BuildAssistantCards([], { text: "Hel", thinking: undefined, tools: [], isSnapshot: true });
		const second = _BuildAssistantCards(first, { text: "Hello world", thinking: undefined, tools: [], isSnapshot: true });
		expect(second.find((c) => c.type === MessageCardKind.Text)?.content).toBe("Hello world");
	});

	it("appends prose for a legacy delta and keeps existing tool cards", () =>
	{
		const existing: MessageCard[] = [
			{ type: MessageCardKind.Tool, label: "search", status: "done" },
			{ type: MessageCardKind.Text, content: "par" }
		];
		const cards = _BuildAssistantCards(existing, { text: "tial", thinking: undefined, tools: [], isSnapshot: false });
		expect(cards.map((c) => c.type)).toEqual([MessageCardKind.Tool, MessageCardKind.Text]);
		expect(cards[1].content).toBe("partial");
	});

	it("keeps the prior body when a snapshot carries no prose", () =>
	{
		const existing: MessageCard[] = [{ type: MessageCardKind.Text, content: "kept" }];
		const cards = _BuildAssistantCards(existing, { text: undefined, thinking: "still thinking", tools: [], isSnapshot: true });
		expect(cards.find((c) => c.type === MessageCardKind.Text)?.content).toBe("kept");
	});

	it("carries a live tool status across a snapshot rebuild", () =>
	{
		const existing: MessageCard[] = [
			{ type: MessageCardKind.Tool, label: "search", status: "running" },
			{ type: MessageCardKind.Text, content: "x" }
		];
		const cards = _BuildAssistantCards(existing, { text: "x", thinking: undefined, tools: [{ name: "search", detail: "" }], isSnapshot: true });
		expect(cards.find((c) => c.type === MessageCardKind.Tool)?.status).toBe("running");
	});
});

describe("_HasRenderableCards", () =>
{
	it("is false for an empty or blank-prose-only stack", () =>
	{
		expect(_HasRenderableCards([])).toBe(false);
		expect(_HasRenderableCards([{ type: MessageCardKind.Text, content: "   " }])).toBe(false);
	});

	it("is true when there is prose, a tool, or a thinking card", () =>
	{
		expect(_HasRenderableCards([{ type: MessageCardKind.Text, content: "hi" }])).toBe(true);
		expect(_HasRenderableCards([{ type: MessageCardKind.Tool, label: "search" }, { type: MessageCardKind.Text, content: "" }])).toBe(true);
		expect(_HasRenderableCards([{ type: MessageCardKind.Thinking, content: "…" }])).toBe(true);
	});
});

describe("_MergeToolCard", () =>
{
	it("inserts a new tool chip just before the prose", () =>
	{
		const cards = _MergeToolCard([{ type: MessageCardKind.Text, content: "reply" }], "fetch", "running");
		expect(cards.map((c) => c.type)).toEqual([MessageCardKind.Tool, MessageCardKind.Text]);
		expect(cards[0]).toMatchObject({ label: "fetch", status: "running" });
	});

	it("updates the status of an existing chip in place", () =>
	{
		const existing: MessageCard[] = [
			{ type: MessageCardKind.Tool, label: "fetch", status: "running" },
			{ type: MessageCardKind.Text, content: "reply" }
		];
		const cards = _MergeToolCard(existing, "fetch", "done");
		expect(cards).toHaveLength(2);
		expect(cards[0].status).toBe("done");
	});

	it("appends the chip when there is no prose card yet", () =>
	{
		const cards = _MergeToolCard([], "fetch", "running");
		expect(cards).toEqual([{ type: MessageCardKind.Tool, label: "fetch", status: "running" }]);
	});
});
