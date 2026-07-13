import { describe, expect, it } from "vitest";

import { UserTenant, UserTenantPhase } from "../tenant-gateway.types";
import { _FilterByClusterTenant, _SetSuspended, _UpsertUserTenant } from "../tenant-store.util";

/** Minimal tenant fixture keyed by `name`. */
function _t(name: string, clusterTenantRef?: string, phase?: UserTenantPhase): UserTenant
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

describe("_UpsertUserTenant", () =>
{
	it("appends a tenant that is not yet present", () =>
	{
		const next = _UpsertUserTenant([_t("a")], _t("b"));
		expect(next.map((t) => t.name)).toEqual(["a", "b"]);
	});

	it("replaces an existing tenant in place without duplicating it", () =>
	{
		const current = [_t("a"), _t("b")];
		const next = _UpsertUserTenant(current, { ..._t("a"), email: "renamed@example.com" });

		expect(next).toHaveLength(2);
		expect(next[0].email).toBe("renamed@example.com");
		expect(next.map((t) => t.name)).toEqual(["a", "b"]);
	});

	it("returns a new array reference (immutability)", () =>
	{
		const current = [_t("a")];
		expect(_UpsertUserTenant(current, _t("b"))).not.toBe(current);
	});
});

describe("_SetSuspended", () =>
{
	it("suspends the matching tenant and moves its phase to suspended", () =>
	{
		const current = [_t("a", "acme", UserTenantPhase.Running), _t("b", "acme", UserTenantPhase.Running)];
		const next = _SetSuspended(current, "a", true);

		expect(next[0].suspended).toBe(true);
		expect(next[0].phase).toBe(UserTenantPhase.Suspended);
		expect(next[1].suspended).toBe(false);
	});

	it("resumes the matching tenant and moves its phase to running", () =>
	{
		const current = [_t("a", "acme", UserTenantPhase.Suspended)];
		const next = _SetSuspended(current, "a", false);

		expect(next[0].suspended).toBe(false);
		expect(next[0].phase).toBe(UserTenantPhase.Running);
	});

	it("is a no-op (same reference) when no tenant matches", () =>
	{
		const current = [_t("a")];
		expect(_SetSuspended(current, "gone", true)).toBe(current);
	});
});

describe("_FilterByClusterTenant", () =>
{
	it("keeps only the tenants of the given parent ClusterTenant", () =>
	{
		const current = [_t("a", "acme"), _t("b", "globex"), _t("c", "acme")];
		const next = _FilterByClusterTenant(current, "acme");
		expect(next.map((t) => t.name)).toEqual(["a", "c"]);
	});

	it("returns an empty array when the ref matches nothing", () =>
	{
		const current = [_t("a", "acme")];
		expect(_FilterByClusterTenant(current, "globex")).toEqual([]);
	});
});
