import { describe, expect, it } from "vitest";

import { _ReconnectDelayMs } from "../reconnect.util";

describe("_ReconnectDelayMs", () =>
{
	it("grows exponentially from 1s", () =>
	{
		expect(_ReconnectDelayMs(0)).toBe(1000);
		expect(_ReconnectDelayMs(1)).toBe(2000);
		expect(_ReconnectDelayMs(2)).toBe(4000);
		expect(_ReconnectDelayMs(3)).toBe(8000);
	});

	it("caps at 15s", () =>
	{
		expect(_ReconnectDelayMs(4)).toBe(15_000);
		expect(_ReconnectDelayMs(10)).toBe(15_000);
	});

	it("floors a negative attempt to the base delay", () =>
	{
		expect(_ReconnectDelayMs(-3)).toBe(1000);
	});
});
