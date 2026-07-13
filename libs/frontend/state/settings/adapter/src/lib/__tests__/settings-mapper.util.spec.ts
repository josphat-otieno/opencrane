import { describe, expect, it } from "vitest";

import { ScopeLevel } from "@opencrane/core";

import {
	_MapAccountProfile,
	_MapAccountUpdateToTenantPatch,
	_MapAwarenessContract,
	_MapBudgetSpend,
	_MapDatasetAccess,
	_MapEgressDomains,
	_MapPodIdentity,
	_MapSkills
} from "../settings-mapper.util";

describe("_MapAccountProfile", () =>
{
	it("maps a fully-populated wire tenant onto the read model", () =>
	{
		const profile = _MapAccountProfile({ name: "alex.oc", displayName: "Alex Kim", email: "alex.kim@acme-corp.com", team: "Product" }, "fallback");

		expect(profile).toEqual({
			name: "alex.oc",
			fullName: "Alex Kim",
			email: "alex.kim@acme-corp.com",
			department: "Product"
		});
	});

	it("falls back to the requested name when the wire omits one", () =>
	{
		const profile = _MapAccountProfile({ displayName: "Alex Kim" }, "alex.oc");

		expect(profile.name).toBe("alex.oc");
	});

	it("collapses missing optional fields to empty strings", () =>
	{
		const profile = _MapAccountProfile({ name: "alex.oc" }, "alex.oc");

		expect(profile.fullName).toBe("");
		expect(profile.email).toBe("");
		expect(profile.department).toBe("");
	});
});

describe("_MapAccountUpdateToTenantPatch", () =>
{
	it("maps both editable fields onto the wire patch keys", () =>
	{
		const patch = _MapAccountUpdateToTenantPatch({ fullName: "Nova Lee", department: "Research" });

		expect(patch).toEqual({ displayName: "Nova Lee", team: "Research" });
	});

	it("emits only the supplied field for a partial update", () =>
	{
		const patch = _MapAccountUpdateToTenantPatch({ department: "Research" });

		expect(patch).toEqual({ team: "Research" });
		expect("displayName" in patch).toBe(false);
	});

	it("emits an empty patch when nothing is supplied", () =>
	{
		expect(_MapAccountUpdateToTenantPatch({})).toEqual({});
	});

	it("treats an explicit empty string as a real edit (clears the field)", () =>
	{
		const patch = _MapAccountUpdateToTenantPatch({ fullName: "" });

		expect(patch).toEqual({ displayName: "" });
	});
});

describe("_MapPodIdentity", () =>
{
	it("maps a fully-populated wire tenant onto the pod identity", () =>
	{
		const pod = _MapPodIdentity(
			{ name: "alex", displayName: "Alex Kim", email: "alex@acme.com", team: "Product", phase: "running", ingressHost: "alex.acme.opencrane.ai", createdAt: "2026-01-12T09:00:00.000Z" },
			"fallback"
		);

		expect(pod).toEqual({
			name: "alex",
			displayName: "Alex Kim",
			email: "alex@acme.com",
			team: "Product",
			phase: "running",
			ingressHost: "alex.acme.opencrane.ai",
			createdAt: "2026-01-12T09:00:00.000Z"
		});
	});

	it("falls back to the requested name and empty strings for missing fields", () =>
	{
		const pod = _MapPodIdentity({ phase: "provisioning" }, "alex");

		expect(pod.name).toBe("alex");
		expect(pod.displayName).toBe("");
		expect(pod.email).toBe("");
		expect(pod.ingressHost).toBe("");
		expect(pod.createdAt).toBe("");
		expect(pod.phase).toBe("provisioning");
	});
});

describe("_MapBudgetSpend", () =>
{
	it("maps populated spend figures and a known alert band", () =>
	{
		expect(_MapBudgetSpend({ monthlyLimitUsd: 100, currentSpendUsd: 82.4, budgetAlertState: "warning" }))
			.toEqual({ monthlyLimitUsd: 100, currentSpendUsd: 82.4, alertState: "warning" });
	});

	it("collapses missing figures to zero and an unknown band to ok", () =>
	{
		expect(_MapBudgetSpend({})).toEqual({ monthlyLimitUsd: 0, currentSpendUsd: 0, alertState: "ok" });
		expect(_MapBudgetSpend({ budgetAlertState: "nonsense" }).alertState).toBe("ok");
	});
});

describe("_MapAwarenessContract", () =>
{
	it("maps the contract identity fields", () =>
	{
		expect(_MapAwarenessContract({ contractId: "c1", contractVersion: "v2.3.1" }))
			.toEqual({ contractId: "c1", contractVersion: "v2.3.1" });
	});

	it("collapses missing fields to empty strings", () =>
	{
		expect(_MapAwarenessContract({})).toEqual({ contractId: "", contractVersion: "" });
	});
});

describe("_MapDatasetAccess", () =>
{
	it("flattens scoped name lists into membership rows with neutral defaults", () =>
	{
		const rows = _MapDatasetAccess({ org: ["acme"], team: ["product"], project: ["platform"], personal: ["alex"] });

		expect(rows).toEqual([
			{ name: "acme", scope: ScopeLevel.Org, access: "read", entries: 0, granted: "—" },
			{ name: "product", scope: ScopeLevel.Dept, access: "read", entries: 0, granted: "—" },
			{ name: "platform", scope: ScopeLevel.Project, access: "read", entries: 0, granted: "—" },
			{ name: "alex", scope: ScopeLevel.Personal, access: "read", entries: 0, granted: "—" }
		]);
	});

	it("maps the contract 'team' scope onto the UI dept scope and tolerates empty groups", () =>
	{
		const rows = _MapDatasetAccess({ team: ["product"] });

		expect(rows).toHaveLength(1);
		expect(rows[0].scope).toBe(ScopeLevel.Dept);
	});
});

describe("_MapSkills", () =>
{
	it("maps catalogue rows and normalises publication status", () =>
	{
		const rows = _MapSkills([
			{ name: "document-writer", scope: "org", version: "1.4.2", digest: "sha256:a3f9", status: "published" },
			{ name: "data-summariser", scope: "personal", version: "local", digest: "—", status: "draft" }
		]);

		expect(rows).toEqual([
			{ name: "document-writer", scope: ScopeLevel.Org, version: "1.4.2", digest: "sha256:a3f9", status: "active" },
			{ name: "data-summariser", scope: ScopeLevel.Personal, version: "local", digest: "—", status: "pending-promotion" }
		]);
	});

	it("defaults missing strings and passes through an unrecognised status", () =>
	{
		const [row] = _MapSkills([{ status: "deprecated" }]);

		expect(row).toEqual({ name: "—", scope: ScopeLevel.Personal, version: "—", digest: "—", status: "deprecated" });
	});
});

describe("_MapEgressDomains", () =>
{
	it("flattens policy domains into rows tagged with the policy name", () =>
	{
		const rows = _MapEgressDomains([{ name: "default", domains: ["api.anthropic.com", "github.com"] }]);

		expect(rows).toEqual([
			{ domain: "api.anthropic.com", purpose: "default", status: "active" },
			{ domain: "github.com", purpose: "default", status: "active" }
		]);
	});

	it("deduplicates a domain across policies (first policy wins)", () =>
	{
		const rows = _MapEgressDomains([
			{ name: "a", domains: ["dup.example.com"] },
			{ name: "b", domains: ["dup.example.com", "unique.example.com"] }
		]);

		expect(rows).toEqual([
			{ domain: "dup.example.com", purpose: "a", status: "active" },
			{ domain: "unique.example.com", purpose: "b", status: "active" }
		]);
	});
});
