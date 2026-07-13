import { describe, expect, it } from "vitest";

import { UserTenant, UserTenantPhase } from "@opencrane/state/tenant/adapter";
import { _ToUserTenantRows, _UserTenantPhaseLabel, _UserTenantPhaseSeverity } from "../customer-admin.util";

/** Minimal UserTenant fixture for the row mapper. */
function _tenant(overrides: Partial<UserTenant>): UserTenant
{
	return {
		name: "alex.oc",
		...overrides
	};
}

describe("_UserTenantPhaseSeverity", () =>
{
	it("maps each modelled phase to its Tag severity", () =>
	{
		expect(_UserTenantPhaseSeverity(UserTenantPhase.Pending)).toBe("info");
		expect(_UserTenantPhaseSeverity(UserTenantPhase.Running)).toBe("success");
		expect(_UserTenantPhaseSeverity(UserTenantPhase.Suspended)).toBe("warn");
		expect(_UserTenantPhaseSeverity(UserTenantPhase.Failed)).toBe("danger");
	});

	it("falls back to secondary for an absent phase", () =>
	{
		expect(_UserTenantPhaseSeverity(undefined)).toBe("secondary");
	});
});

describe("_UserTenantPhaseLabel", () =>
{
	it("renders a title-case label per phase", () =>
	{
		expect(_UserTenantPhaseLabel(UserTenantPhase.Pending)).toBe("Pending");
		expect(_UserTenantPhaseLabel(UserTenantPhase.Running)).toBe("Running");
		expect(_UserTenantPhaseLabel(UserTenantPhase.Suspended)).toBe("Suspended");
		expect(_UserTenantPhaseLabel(UserTenantPhase.Failed)).toBe("Failed");
		expect(_UserTenantPhaseLabel(undefined)).toBe("Unknown");
	});
});

describe("_ToUserTenantRows", () =>
{
	it("pre-formats tenants into table rows, keeping the enum phase", () =>
	{
		const rows = _ToUserTenantRows([
			_tenant({
				name: "alex.oc",
				email: "alex@acme.test",
				ingressHost: "alex.acme.example.com",
				phase: UserTenantPhase.Running,
				suspended: false
			})
		]);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			name: "alex.oc",
			email: "alex@acme.test",
			ingressHost: "alex.acme.example.com",
			phase: UserTenantPhase.Running,
			suspended: false
		});
	});

	it("renders an em dash for a missing email and ingress host", () =>
	{
		const rows = _ToUserTenantRows([_tenant({ email: undefined, ingressHost: undefined })]);
		expect(rows[0].email).toBe("—");
		expect(rows[0].ingressHost).toBe("—");
	});

	it("derives suspended from the Suspended phase when the flag is absent", () =>
	{
		const rows = _ToUserTenantRows([_tenant({ phase: UserTenantPhase.Suspended })]);
		expect(rows[0].suspended).toBe(true);
	});

	it("prefers the explicit suspended flag over the phase", () =>
	{
		const rows = _ToUserTenantRows([_tenant({ phase: UserTenantPhase.Running, suspended: true })]);
		expect(rows[0].suspended).toBe(true);
	});

	it("defaults suspended to false when neither flag nor Suspended phase is present", () =>
	{
		const rows = _ToUserTenantRows([_tenant({ phase: UserTenantPhase.Pending })]);
		expect(rows[0].suspended).toBe(false);
	});
});
