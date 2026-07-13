import { describe, expect, it } from "vitest";

import { _NewSessionId } from "../session-page/session-page.utils";

describe("_NewSessionId", () =>
{
	it("mints an `s-` prefixed, URL-safe key", () =>
	{
		expect(_NewSessionId()).toMatch(/^s-[\w-]+$/);
	});

	it("mints a fresh key on every call", () =>
	{
		expect(_NewSessionId()).not.toBe(_NewSessionId());
	});
});
