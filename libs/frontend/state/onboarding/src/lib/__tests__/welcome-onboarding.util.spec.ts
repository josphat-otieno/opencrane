import { describe, expect, it } from "vitest";

import { _HasCompletedWelcome, _WelcomeCompletedValue } from "../welcome-onboarding.util";

describe("_HasCompletedWelcome", () =>
{
	it("treats the canonical completed value as done", () =>
	{
		expect(_HasCompletedWelcome(_WelcomeCompletedValue())).toBe(true);
	});

	it("treats a never-set (null) value as not completed", () =>
	{
		expect(_HasCompletedWelcome(null)).toBe(false);
	});

	it("treats an empty string as not completed", () =>
	{
		expect(_HasCompletedWelcome("")).toBe(false);
	});

	it("treats a stale or unknown value as not completed", () =>
	{
		expect(_HasCompletedWelcome("0")).toBe(false);
		expect(_HasCompletedWelcome("true")).toBe(false);
		expect(_HasCompletedWelcome("seen")).toBe(false);
	});
});
