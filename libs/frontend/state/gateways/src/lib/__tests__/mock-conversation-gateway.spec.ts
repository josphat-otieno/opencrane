import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it } from "vitest";

import type { SessionSummary, ThreadMessage } from "@opencrane/core";
import { SESSIONS } from "@opencrane/core/testing";
import { CONVERSATION_CACHE, ConnectionStatus } from "@opencrane/state/core";
import type { CachedThread, ConversationCache } from "@opencrane/state/core";

import { MockConversationGateway } from "../__test__/mock-conversation-gateway";

/** Records saves and can preload a snapshot, for the cache-interaction tests. */
class FakeCache implements ConversationCache
{
	public readonly saved = new Map<string, ThreadMessage[]>();
	public preload: CachedThread | null = null;

	public async load(threadId: string): Promise<CachedThread | null>
	{
		return this.preload && this.preload.threadId === threadId ? this.preload : null;
	}

	public async save(threadId: string, messages: ThreadMessage[]): Promise<void>
	{
		this.saved.set(threadId, messages);
	}

	public async loadSessions(): Promise<SessionSummary[] | null>
	{
		return null;
	}

	public async saveSessions(): Promise<void>
	{
		// no-op for this transcript-focused fake
	}

	public async clear(): Promise<void>
	{
		this.saved.clear();
	}
}

/** Construct the gateway inside an injection context so its `inject()` calls resolve. */
function _make(cache?: ConversationCache): MockConversationGateway
{
	const injector = Injector.create({ providers: cache ? [{ provide: CONVERSATION_CACHE, useValue: cache }] : [] });
	return runInInjectionContext(injector, () => new MockConversationGateway());
}

describe("MockConversationGateway", () =>
{
	it("opens a thread windowed to the initial page with more history available", () =>
	{
		const mock = _make();
		mock.open("t1");

		expect(mock.status()).toBe(ConnectionStatus.Open);
		expect(mock.messages().length).toBe(12);
		expect(mock.hasMoreHistory()).toBe(true);
	});

	it("grows the window when loading older history", async () =>
	{
		const mock = _make();
		mock.open("t1");
		const before = mock.messages().length;

		await mock.loadOlder();

		expect(mock.messages().length).toBeGreaterThan(before);
	});

	it("reaches the start of the transcript and stops offering more", async () =>
	{
		const mock = _make();
		mock.open("t1");

		for (let i = 0; i < 20 && mock.hasMoreHistory(); i++)
		{
			await mock.loadOlder();
		}

		expect(mock.hasMoreHistory()).toBe(false);
		await expect(mock.loadOlder()).resolves.toBeUndefined();
	});

	it("appends a sent message and persists the transcript", async () =>
	{
		const cache = new FakeCache();
		const mock = _make(cache);
		mock.open("t1");

		mock.send("hello there");
		await Promise.resolve();

		const messages = mock.messages();
		expect(messages[messages.length - 1].cards[0].content).toBe("hello there");
		expect(cache.saved.get("t1")).toBeDefined();
		expect(cache.saved.get("t1")?.some((m) => m.cards[0]?.content === "hello there")).toBe(true);
	});

	it("enumerates the bundled fixture sessions for the sidebar", async () =>
	{
		const mock = _make();

		const sessions = await mock.listSessions();

		expect(sessions).toHaveLength(SESSIONS.length);
		expect(sessions.map((s) => s.id)).toEqual(SESSIONS.map((s) => s.id));
	});

	it("resolves a shallow copy so callers cannot mutate the fixture", async () =>
	{
		const mock = _make();

		const sessions = await mock.listSessions();
		sessions[0].name = "mutated";

		expect(SESSIONS[0].name).not.toBe("mutated");
	});

	it("repaints the cached transcript on open", async () =>
	{
		const cache = new FakeCache();
		cache.preload = {
			threadId: "t1",
			messages: [
				{ id: "c0", role: "user", time: "08:00", cards: [{ type: "text", content: "cached one" }] as ThreadMessage["cards"] },
				{ id: "c1", role: "assistant", time: "08:01", cards: [{ type: "text", content: "cached two" }] as ThreadMessage["cards"] }
			],
			updatedAt: 0
		};
		const mock = _make(cache);

		mock.open("t1");
		await Promise.resolve();
		await Promise.resolve();

		expect(mock.messages()).toHaveLength(2);
		expect(mock.messages()[0].cards[0].content).toBe("cached one");
	});
});
