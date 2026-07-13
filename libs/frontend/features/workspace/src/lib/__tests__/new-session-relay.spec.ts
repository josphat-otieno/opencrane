import { describe, expect, it } from "vitest";

import { NewSessionRelay } from "../session-page/new-session-relay";

describe("NewSessionRelay", () =>
{
	it("consume returns the stashed message", () =>
	{
		const relay = new NewSessionRelay();
		relay.stash("hello");
		expect(relay.consume()).toBe("hello");
	});

	it("consume clears the slot — a second consume returns undefined", () =>
	{
		const relay = new NewSessionRelay();
		relay.stash("hello");
		relay.consume();
		expect(relay.consume()).toBeUndefined();
	});

	it("consume is undefined when nothing was stashed", () =>
	{
		expect(new NewSessionRelay().consume()).toBeUndefined();
	});

	it("a later stash overwrites an unconsumed message (last write wins)", () =>
	{
		const relay = new NewSessionRelay();
		relay.stash("first");
		relay.stash("second");
		expect(relay.consume()).toBe("second");
	});
});
