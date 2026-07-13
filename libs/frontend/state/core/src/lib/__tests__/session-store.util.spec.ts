import { describe, expect, it } from "vitest";

import { SessionTenant } from "../session-store.types";
import { _DeriveCapabilities, _ResolveCurrentTenant } from "../session-store.util";

describe("_DeriveCapabilities", () =>
{
	/** Every capability false — the fail-closed shape, reused across cases. */
	const _NONE = {
		isOperator: false,
		isPlatformOperator: false,
		customerAdmin: false,
		manageTenants: false,
		manageCustomers: false,
		managePolicies: false,
		manageBudgets: false
	};

	it("grants every capability for a platform operator on the platform surface", () =>
	{
		const caps = _DeriveCapabilities(true, true, false, "platform");

		expect(caps).toEqual({
			isOperator: true,
			isPlatformOperator: true,
			customerAdmin: false,
			manageTenants: true,
			manageCustomers: true,
			managePolicies: true,
			manageBudgets: true
		});
	});

	it("grants the operator console + account powers to a customer admin on the org surface, but not fleet-wide customer management", () =>
	{
		const caps = _DeriveCapabilities(true, false, true, "org");

		expect(caps.customerAdmin).toBe(true);
		expect(caps.isOperator).toBe(true);
		expect(caps.manageTenants).toBe(true);
		// Fleet-wide flags stay exclusive to the platform operator.
		expect(caps.isPlatformOperator).toBe(false);
		expect(caps.manageCustomers).toBe(false);
	});

	it("ignores a role claim that does not belong to the app's surface (strict domain separation)", () =>
	{
		// A platform-operator token used on the org surface grants nothing...
		expect(_DeriveCapabilities(true, true, false, "org")).toEqual(_NONE);
		// ...and an org-admin token used on the platform surface grants nothing.
		expect(_DeriveCapabilities(true, false, true, "platform")).toEqual(_NONE);
	});

	it("derives manageCustomers from the platform-operator claim on the platform surface alone", () =>
	{
		expect(_DeriveCapabilities(true, true, false, "platform").manageCustomers).toBe(true);
		expect(_DeriveCapabilities(true, false, true, "org").manageCustomers).toBe(false);
		expect(_DeriveCapabilities(true, false, false, "platform").manageCustomers).toBe(false);
	});

	it("denies the operator console to an authenticated session with no operator/admin claim", () =>
	{
		// The tightened least-privilege model: authentication alone no longer grants
		// operator-tier access — a real platform-operator or org-admin claim is required.
		expect(_DeriveCapabilities(true, false, false, "platform")).toEqual(_NONE);
	});

	it("denies everything when unauthenticated, even if role flags are set", () =>
	{
		expect(_DeriveCapabilities(false, true, true, "platform")).toEqual(_NONE);
	});
});

describe("_ResolveCurrentTenant", () =>
{
	/** Fixture: two tenants owned by distinct emails, used across the cases. */
	const _TENANTS: SessionTenant[] = [
		{ name: "alex.oc", email: "alex@acme.test" },
		{ name: "bea.oc", email: "bea@acme.test" }
	];

	it("falls back to the caller's own tenant by email when nothing is selected", () =>
	{
		const tenant = _ResolveCurrentTenant(null, _TENANTS, "bea@acme.test");

		expect(tenant?.name).toBe("bea.oc");
	});

	it("matches the email case-insensitively in the fallback path", () =>
	{
		const tenant = _ResolveCurrentTenant(null, _TENANTS, "ALEX@ACME.TEST");

		expect(tenant?.name).toBe("alex.oc");
	});

	it("prefers an explicit selection over the email match", () =>
	{
		// Caller owns bea.oc but switched to alex.oc; the selection must win.
		const tenant = _ResolveCurrentTenant("alex.oc", _TENANTS, "bea@acme.test");

		expect(tenant?.name).toBe("alex.oc");
	});

	it("falls back to the email match when the selection names no visible tenant", () =>
	{
		const tenant = _ResolveCurrentTenant("ghost.oc", _TENANTS, "bea@acme.test");

		expect(tenant?.name).toBe("bea.oc");
	});

	it("falls back to the first visible tenant when no selection and no email match", () =>
	{
		// An operator session whose email maps to no pod still resolves an active
		// pod (the first visible one) rather than pointing at nothing.
		expect(_ResolveCurrentTenant(null, _TENANTS, "nobody@acme.test")?.name).toBe("alex.oc");
		expect(_ResolveCurrentTenant(null, _TENANTS, undefined)?.name).toBe("alex.oc");
		// A stale selection with no email match also lands on the first visible pod.
		expect(_ResolveCurrentTenant("ghost.oc", _TENANTS, "nobody@acme.test")?.name).toBe("alex.oc");
	});

	it("returns undefined only when no tenants are visible", () =>
	{
		expect(_ResolveCurrentTenant(null, [], "anyone@acme.test")).toBeUndefined();
		expect(_ResolveCurrentTenant("ghost.oc", [], undefined)).toBeUndefined();
	});
});
