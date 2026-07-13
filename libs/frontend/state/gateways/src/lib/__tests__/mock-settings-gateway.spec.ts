import { describe, expect, it } from "vitest";

import { MockSettingsGateway } from "../__test__/mock-settings-gateway";

describe("MockSettingsGateway", () =>
{
	it("returns the existing Account fixture values", async () =>
	{
		const gateway = new MockSettingsGateway();
		const profile = await gateway.getAccountProfile("alex.oc");

		expect(profile.fullName).toBe("Alex Kim");
		expect(profile.email).toBe("alex.kim@acme-corp.com");
		expect(profile.department).toBe("Product");
	});

	it("echoes the requested tenant name onto the profile", async () =>
	{
		const gateway = new MockSettingsGateway();
		const profile = await gateway.getAccountProfile("nova.oc");

		expect(profile.name).toBe("nova.oc");
		// Identity values stay fixture-stable regardless of the requested tenant.
		expect(profile.fullName).toBe("Alex Kim");
	});

	it("does not share a mutable reference between calls", async () =>
	{
		const gateway = new MockSettingsGateway();
		const first = await gateway.getAccountProfile("alex.oc");
		first.fullName = "Mutated";
		const second = await gateway.getAccountProfile("alex.oc");

		expect(second.fullName).toBe("Alex Kim");
	});

	it("persists an update and round-trips it on the next read", async () =>
	{
		const gateway = new MockSettingsGateway();
		const saved = await gateway.updateAccountProfile("alex.oc", { fullName: "Alex K.", department: "Platform" });

		expect(saved.fullName).toBe("Alex K.");
		expect(saved.department).toBe("Platform");
		// The email stays untouched — it is not part of the editable update.
		expect(saved.email).toBe("alex.kim@acme-corp.com");

		const reread = await gateway.getAccountProfile("alex.oc");
		expect(reread.fullName).toBe("Alex K.");
		expect(reread.department).toBe("Platform");
	});

	it("applies a partial update, leaving the unspecified field unchanged", async () =>
	{
		const gateway = new MockSettingsGateway();
		const saved = await gateway.updateAccountProfile("alex.oc", { department: "Platform" });

		expect(saved.department).toBe("Platform");
		expect(saved.fullName).toBe("Alex Kim");
	});

	it("scopes edits to their own tenant", async () =>
	{
		const gateway = new MockSettingsGateway();
		await gateway.updateAccountProfile("alex.oc", { fullName: "Alex K." });
		const other = await gateway.getAccountProfile("nova.oc");

		expect(other.fullName).toBe("Alex Kim");
	});
});
