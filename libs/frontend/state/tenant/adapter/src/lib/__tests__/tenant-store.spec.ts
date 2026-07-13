import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it } from "vitest";

import { USER_TENANT_GATEWAY, UserTenant, UserTenantGateway, UserTenantPhase } from "../tenant-gateway.types";
import { UserTenantStore } from "../tenant-store";

/** Build a read-model tenant. */
function _tenant(name: string, clusterTenantRef?: string, phase: UserTenantPhase = UserTenantPhase.Running): UserTenant
{
	return {
		name,
		email: `${name}@example.com`,
		clusterTenantRef,
		ingressHost: `${name}.ai.example`,
		phase,
		suspended: phase === UserTenantPhase.Suspended
	};
}

/**
 * Configurable fake gateway: records calls and lets each method be made to
 * reject, so the store's optimistic-then-rollback paths are exercised without a
 * real transport. `list` honours the `clusterTenantRef` filter argument.
 */
class FakeGateway implements UserTenantGateway
{
	public listResult: UserTenant[] = [];
	public failSuspend = false;
	public failResume = false;
	public readonly suspended: string[] = [];
	public readonly resumed: string[] = [];
	public lastListRef: string | undefined = undefined;

	public async list(clusterTenantRef?: string): Promise<UserTenant[]>
	{
		this.lastListRef = clusterTenantRef;
		if (clusterTenantRef === undefined)
		{
			return this.listResult;
		}
		return this.listResult.filter((t) => t.clusterTenantRef === clusterTenantRef);
	}

	public async get(name: string): Promise<UserTenant>
	{
		return _tenant(name);
	}

	public async suspend(name: string): Promise<void>
	{
		if (this.failSuspend)
		{
			throw new Error("suspend boom");
		}
		this.suspended.push(name);
	}

	public async resume(name: string): Promise<void>
	{
		if (this.failResume)
		{
			throw new Error("resume boom");
		}
		this.resumed.push(name);
	}
}

/** Construct the store in an injection context bound to `gateway`. */
function _make(gateway: UserTenantGateway): UserTenantStore
{
	const injector = Injector.create({ providers: [{ provide: USER_TENANT_GATEWAY, useValue: gateway }] });
	return runInInjectionContext(injector, () => new UserTenantStore());
}

describe("UserTenantStore", () =>
{
	it("loads the collection from the gateway and derives count", async () =>
	{
		const gateway = new FakeGateway();
		gateway.listResult = [_tenant("a", "acme"), _tenant("b", "globex")];
		const store = _make(gateway);

		await store.load();

		expect(store.count()).toBe(2);
		expect(store.tenants().map((t) => t.name)).toEqual(["a", "b"]);
		expect(store.loading()).toBe(false);
		expect(store.error()).toBeNull();
		expect(gateway.lastListRef).toBeUndefined();
	});

	it("passes the clusterTenantRef through to the gateway on a scoped load", async () =>
	{
		const gateway = new FakeGateway();
		gateway.listResult = [_tenant("a", "acme"), _tenant("b", "globex"), _tenant("c", "acme")];
		const store = _make(gateway);

		await store.load("acme");

		expect(gateway.lastListRef).toBe("acme");
		expect(store.tenants().map((t) => t.name)).toEqual(["a", "c"]);
	});

	it("records an error and stops loading when list fails", async () =>
	{
		const gateway = new FakeGateway();
		gateway.list = async () =>
		{
			throw new Error("list boom");
		};
		const store = _make(gateway);

		await store.load();

		expect(store.error()).toBe("list boom");
		expect(store.loading()).toBe(false);
		expect(store.count()).toBe(0);
	});

	it("selects tenants by parent ClusterTenant from local state", async () =>
	{
		const gateway = new FakeGateway();
		gateway.listResult = [_tenant("a", "acme"), _tenant("b", "globex"), _tenant("c", "acme")];
		const store = _make(gateway);
		await store.load();

		expect(store.byClusterTenant("acme").map((t) => t.name)).toEqual(["a", "c"]);
		expect(store.byClusterTenant("globex").map((t) => t.name)).toEqual(["b"]);
		expect(store.byClusterTenantMap().get("acme")?.map((t) => t.name)).toEqual(["a", "c"]);
	});

	it("suspends optimistically and records the gateway call", async () =>
	{
		const gateway = new FakeGateway();
		gateway.listResult = [_tenant("a", "acme", UserTenantPhase.Running)];
		const store = _make(gateway);
		await store.load();

		const ok = await store.suspend("a");

		expect(ok).toBe(true);
		expect(store.tenants()[0].suspended).toBe(true);
		expect(store.tenants()[0].phase).toBe(UserTenantPhase.Suspended);
		expect(gateway.suspended).toEqual(["a"]);
	});

	it("rolls back the optimistic suspend when the gateway fails", async () =>
	{
		const gateway = new FakeGateway();
		gateway.listResult = [_tenant("a", "acme", UserTenantPhase.Running)];
		gateway.failSuspend = true;
		const store = _make(gateway);
		await store.load();

		const ok = await store.suspend("a");

		expect(ok).toBe(false);
		expect(store.tenants()[0].suspended).toBe(false);
		expect(store.tenants()[0].phase).toBe(UserTenantPhase.Running);
		expect(store.error()).toBe("suspend boom");
	});

	it("resumes optimistically and records the gateway call", async () =>
	{
		const gateway = new FakeGateway();
		gateway.listResult = [_tenant("a", "acme", UserTenantPhase.Suspended)];
		const store = _make(gateway);
		await store.load();

		const ok = await store.resume("a");

		expect(ok).toBe(true);
		expect(store.tenants()[0].suspended).toBe(false);
		expect(store.tenants()[0].phase).toBe(UserTenantPhase.Running);
		expect(gateway.resumed).toEqual(["a"]);
	});

	it("restores prior state when resume fails", async () =>
	{
		const gateway = new FakeGateway();
		gateway.listResult = [_tenant("a", "acme", UserTenantPhase.Suspended)];
		gateway.failResume = true;
		const store = _make(gateway);
		await store.load();

		const ok = await store.resume("a");

		expect(ok).toBe(false);
		expect(store.tenants()[0].suspended).toBe(true);
		expect(store.tenants()[0].phase).toBe(UserTenantPhase.Suspended);
		expect(store.error()).toBe("resume boom");
	});

	it("filters by clusterTenantRef end-to-end against the mock gateway", async () =>
	{
		const gateway = new FakeGateway();
		gateway.listResult = [_tenant("mike", "acme"), _tenant("nina", "globex")];
		const store = _make(gateway);

		await store.load("globex");

		expect(store.count()).toBeGreaterThan(0);
		expect(store.tenants().every((t) => t.clusterTenantRef === "globex")).toBe(true);
	});

	it("suspend then resume against the mock gateway lands the pod back in running", async () =>
	{
		const gateway = new FakeGateway();
		gateway.listResult = [_tenant("mike", "acme", UserTenantPhase.Running)];
		const store = _make(gateway);
		await store.load("acme");

		await store.suspend("mike");
		expect(store.tenants().find((t) => t.name === "mike")?.phase).toBe(UserTenantPhase.Suspended);

		await store.resume("mike");
		expect(store.tenants().find((t) => t.name === "mike")?.phase).toBe(UserTenantPhase.Running);
	});
});
