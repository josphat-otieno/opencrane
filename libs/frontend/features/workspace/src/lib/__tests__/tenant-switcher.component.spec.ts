import { Injector, runInInjectionContext, signal } from "@angular/core";
import { describe, expect, it } from "vitest";

import { SessionStore } from "@opencrane/state/core";
import { TenantSwitcherComponent } from "../components/tenant-switcher/tenant-switcher.component";

/** A tenant shape as the switcher reads it (name only is exercised here). */
interface FakeTenant
{
	/** Tenant (pod) name. */
	name: string;
	/** Owner email (present for shape parity; unused by the switcher). */
	email: string;
}

/**
 * A framework-light stand-in for {@link SessionStore} exposing only what the
 * switcher reads: a `tenants` resource-like value, the resolved `currentTenant`
 * signal, and a `switchTenant` command that records its argument. Kept local so
 * the spec runs in the Node env without TestBed or `@angular/router`.
 */
class FakeSessionStore
{
	/** Backing list the resource-like `tenants` returns. */
	public readonly list = signal<FakeTenant[]>([]);

	/** The active tenant the switcher displays. */
	public readonly currentTenant = signal<FakeTenant | undefined>(undefined);

	/** The last tenant name passed to {@link switchTenant}, or null if never. */
	public switched: string | null = null;

	/** Resource-like accessor matching the store's `tenants` (hasValue/value). */
	public readonly tenants = {
		hasValue: (): boolean => this.list().length > 0,
		value: (): FakeTenant[] => this.list()
	};

	/** Records the switch target (the real store sets its selection signal). */
	public switchTenant(name: string): void
	{
		this.switched = name;
	}
}

/** Construct the switcher in an injection context bound to a fake store. */
function _make(store: FakeSessionStore): TenantSwitcherComponent
{
	const injector = Injector.create({ providers: [{ provide: SessionStore, useValue: store }] });
	return runInInjectionContext(injector, () => new TenantSwitcherComponent());
}

describe("TenantSwitcherComponent", () =>
{
	it("lists tenant names from the store and shows the active tenant", () =>
	{
		const store = new FakeSessionStore();
		store.list.set([{ name: "alex.oc", email: "a@x.test" }, { name: "bea.oc", email: "b@x.test" }]);
		store.currentTenant.set({ name: "bea.oc", email: "b@x.test" });
		const cmp = _make(store);

		expect(cmp.tenantNames()).toEqual(["alex.oc", "bea.oc"]);
		expect(cmp.activeName()).toBe("bea.oc");
	});

	it("only offers a choice once more than one tenant is visible", () =>
	{
		const store = new FakeSessionStore();
		const cmp = _make(store);

		expect(cmp.hasChoice()).toBe(false);

		store.list.set([{ name: "solo.oc", email: "s@x.test" }]);
		expect(cmp.hasChoice()).toBe(false);

		store.list.set([{ name: "solo.oc", email: "s@x.test" }, { name: "duo.oc", email: "d@x.test" }]);
		expect(cmp.hasChoice()).toBe(true);
	});

	it("switches the active tenant on a non-null selection and ignores a cleared one", () =>
	{
		const store = new FakeSessionStore();
		const cmp = _make(store);

		cmp.onSelect("alex.oc");
		expect(store.switched).toBe("alex.oc");

		cmp.onSelect(null);
		// A cleared selection must not switch away from the current tenant.
		expect(store.switched).toBe("alex.oc");
	});
});
