import { describe, expect, it } from "vitest";

import { _MOCK_DEMO_TENANT, _ResolveActiveTenant } from "../active-tenant.util";

describe("_ResolveActiveTenant", () =>
{
	it("returns the resolved live tenant when one is present", () =>
	{
		expect(_ResolveActiveTenant("alex", false, "live")).toBe("alex");
		// A live tenant wins even if the list reports still-loading.
		expect(_ResolveActiveTenant("alex", true, "live")).toBe("alex");
		// ...and regardless of mode.
		expect(_ResolveActiveTenant("alex", false, "mock")).toBe("alex");
	});

	it("stays idle (undefined) while the live tenant list is still loading", () =>
	{
		expect(_ResolveActiveTenant(undefined, true, "live")).toBeUndefined();
		expect(_ResolveActiveTenant(undefined, true, "mock")).toBeUndefined();
	});

	it("falls back to the demo pod once settled with no tenant in mock mode", () =>
	{
		expect(_ResolveActiveTenant(undefined, false, "mock")).toBe(_MOCK_DEMO_TENANT);
	});

	it("stays idle (undefined) once settled with no tenant in live mode — no doomed request against a fixture", () =>
	{
		// A live session with no provisioned pod must not fall back to the demo
		// fixture (which the real control plane would 404); it shows an empty state.
		expect(_ResolveActiveTenant(undefined, false, "live")).toBeUndefined();
	});
});
