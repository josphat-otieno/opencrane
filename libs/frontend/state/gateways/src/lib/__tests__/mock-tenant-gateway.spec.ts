import { describe, expect, it } from "vitest";

import { UserTenantPhase } from "@opencrane/state/tenant/adapter";
import { MockUserTenantGateway } from "../__test__/mock-tenant-gateway";

describe("MockUserTenantGateway", () =>
{
	it("is seeded with pods across the acme and globex ClusterTenants", async () =>
	{
		const gateway = new MockUserTenantGateway();
		const tenants = await gateway.list();

		expect(tenants.length).toBeGreaterThan(1);
		const refs = new Set(tenants.map((t) => t.clusterTenantRef));
		expect(refs.has("acme")).toBe(true);
		expect(refs.has("globex")).toBe(true);
	});

	it("derives an ingressHost of <user>.<baseDomain> per pod", async () =>
	{
		const gateway = new MockUserTenantGateway();
		const tenants = await gateway.list();

		const mike = tenants.find((t) => t.name === "mike");
		expect(mike?.ingressHost).toBe("mike.ai.acme.example");
		const nina = tenants.find((t) => t.name === "nina");
		expect(nina?.ingressHost).toBe("nina.ai.globex.example");
	});

	it("filters the list by clusterTenantRef", async () =>
	{
		const gateway = new MockUserTenantGateway();

		const acme = await gateway.list("acme");
		expect(acme.length).toBeGreaterThan(0);
		expect(acme.every((t) => t.clusterTenantRef === "acme")).toBe(true);

		const globex = await gateway.list("globex");
		expect(globex.every((t) => t.clusterTenantRef === "globex")).toBe(true);

		const full = await gateway.list();
		expect(acme.length + globex.length).toBe(full.length);
	});

	it("returns an empty list for an unknown clusterTenantRef", async () =>
	{
		const gateway = new MockUserTenantGateway();
		expect(await gateway.list("initech")).toEqual([]);
	});

	it("suspends a pod, moving its phase to suspended", async () =>
	{
		const gateway = new MockUserTenantGateway();
		await gateway.suspend("mike");

		const mike = await gateway.get("mike");
		expect(mike.suspended).toBe(true);
		expect(mike.phase).toBe(UserTenantPhase.Suspended);
	});

	it("resumes a suspended pod, moving its phase to running", async () =>
	{
		const gateway = new MockUserTenantGateway();
		await gateway.resume("leo");

		const leo = await gateway.get("leo");
		expect(leo.suspended).toBe(false);
		expect(leo.phase).toBe(UserTenantPhase.Running);
	});

	it("rejects get/suspend/resume for an unknown tenant", async () =>
	{
		const gateway = new MockUserTenantGateway();
		await expect(gateway.get("ghost")).rejects.toThrow(/not found/);
		await expect(gateway.suspend("ghost")).rejects.toThrow(/not found/);
		await expect(gateway.resume("ghost")).rejects.toThrow(/not found/);
	});

	it("does not let a list caller mutate the gateway's internal records", async () =>
	{
		const gateway = new MockUserTenantGateway();
		const first = await gateway.list();
		first[0].suspended = !first[0].suspended;

		const second = await gateway.list();
		expect(second[0].suspended).not.toBe(first[0].suspended);
	});
});
