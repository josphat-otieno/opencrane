import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ThreadMessage } from "@opencrane/core";

import { IndexedDbConversationCache } from "../indexed-db-conversation-cache";

/** Build a trivial text message for fixtures. */
function _msg(id: string, content: string): ThreadMessage
{
	return { id, role: "assistant", time: "10:00", cards: [{ type: "text", content }] as ThreadMessage["cards"] };
}

describe("IndexedDbConversationCache", () =>
{
	let cache: IndexedDbConversationCache;

	beforeEach(async () =>
	{
		cache = new IndexedDbConversationCache();
		await cache.clear();
	});

	afterEach(async () =>
	{
		await cache.clear();
	});

	it("returns null for a thread that has never been cached", async () =>
	{
		expect(await cache.load("unknown")).toBeNull();
	});

	it("round-trips a saved transcript", async () =>
	{
		const messages = [_msg("a", "hello"), _msg("b", "world")];
		await cache.save("t1", messages);

		const loaded = await cache.load("t1");
		expect(loaded).not.toBeNull();
		expect(loaded?.threadId).toBe("t1");
		expect(loaded?.messages).toEqual(messages);
		expect(typeof loaded?.updatedAt).toBe("number");
	});

	it("overwrites the prior snapshot for the same thread", async () =>
	{
		await cache.save("t1", [_msg("a", "first")]);
		await cache.save("t1", [_msg("a", "first"), _msg("b", "second")]);

		const loaded = await cache.load("t1");
		expect(loaded?.messages).toHaveLength(2);
	});

	it("keeps threads isolated by id", async () =>
	{
		await cache.save("t1", [_msg("a", "one")]);
		await cache.save("t2", [_msg("a", "two"), _msg("b", "two-b")]);

		expect((await cache.load("t1"))?.messages).toHaveLength(1);
		expect((await cache.load("t2"))?.messages).toHaveLength(2);
	});

	it("clears a single thread without touching others", async () =>
	{
		await cache.save("t1", [_msg("a", "one")]);
		await cache.save("t2", [_msg("a", "two")]);

		await cache.clear("t1");

		expect(await cache.load("t1")).toBeNull();
		expect(await cache.load("t2")).not.toBeNull();
	});

	it("clears the whole store when no id is given", async () =>
	{
		await cache.save("t1", [_msg("a", "one")]);
		await cache.save("t2", [_msg("a", "two")]);

		await cache.clear();

		expect(await cache.load("t1")).toBeNull();
		expect(await cache.load("t2")).toBeNull();
	});
});

describe("IndexedDbConversationCache without IndexedDB", () =>
{
	const original = globalThis.indexedDB;

	beforeEach(() =>
	{
		// Simulate SSR / a locked-down browser with no IndexedDB.
		(globalThis as { indexedDB?: unknown }).indexedDB = undefined;
	});

	afterEach(() =>
	{
		(globalThis as { indexedDB?: unknown }).indexedDB = original;
	});

	it("degrades to a no-op rather than throwing", async () =>
	{
		const cache = new IndexedDbConversationCache();
		await expect(cache.save("t1", [_msg("a", "x")])).resolves.toBeUndefined();
		await expect(cache.load("t1")).resolves.toBeNull();
		await expect(cache.clear()).resolves.toBeUndefined();
	});
});
