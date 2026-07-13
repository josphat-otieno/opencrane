import { _PLAN_CATALOGUE } from "../../data/plans.data";
import { _PlanToClusterTenantBody } from "../plan.util";
import { Plan } from "../plan.types";

/** Looks up a seed plan by id, failing the test if it is absent. */
function _planById(id: string): Plan
{
	const _plan: Plan | undefined = _PLAN_CATALOGUE.find(function match(plan: Plan): boolean { return plan.id === id; });
	if (_plan === undefined)
	{
		throw new Error(`missing seed plan: ${id}`);
	}
	return _plan;
}

describe("_PlanToClusterTenantBody", function suite()
{
	it("maps every catalogue plan to a valid body (tier preserved, quota carried, compute mode correct)", function eachPlan()
	{
		for (const plan of _PLAN_CATALOGUE)
		{
			const _body = _PlanToClusterTenantBody(plan, { name: plan.id, displayName: plan.name });

			expect(_body.name).toBe(plan.id);
			expect(_body.displayName).toBe(plan.name);
			expect(_body.isolationTier).toBe(plan.isolationTier);
			expect(_body.resources.quota).toEqual(plan.quota);
			expect(_body.compute.mode).toBe(plan.isolationTier === "shared" ? "shared" : "dedicated");
		}
	});

	it("uses shared compute with no node pool for the shared tier", function sharedBranch()
	{
		const _starter = _planById("starter");

		const _body = _PlanToClusterTenantBody(_starter, { name: "acme", displayName: "Acme" });

		expect(_starter.isolationTier).toBe("shared");
		expect(_body.compute.mode).toBe("shared");
		expect(_body.compute.nodePool).toBeUndefined();
	});

	it("ignores a supplied node pool for the shared tier", function sharedIgnoresNodePool()
	{
		const _starter = _planById("starter");

		const _body = _PlanToClusterTenantBody(_starter, { name: "acme", displayName: "Acme", nodePool: "pool-a" });

		expect(_body.compute.mode).toBe("shared");
		expect(_body.compute.nodePool).toBeUndefined();
	});

	it("includes the node pool for a dedicated tier when supplied", function dedicatedWithNodePool()
	{
		const _team = _planById("team");

		const _body = _PlanToClusterTenantBody(_team, { name: "acme", displayName: "Acme", nodePool: "pool-gpu" });

		expect(_team.isolationTier).toBe("dedicatedNodes");
		expect(_body.compute.mode).toBe("dedicated");
		expect(_body.compute.nodePool).toBe("pool-gpu");
	});

	it("omits the node pool for a dedicated tier when none is supplied", function dedicatedWithoutNodePool()
	{
		const _enterprise = _planById("enterprise");

		const _body = _PlanToClusterTenantBody(_enterprise, { name: "acme", displayName: "Acme" });

		expect(_enterprise.isolationTier).toBe("dedicatedCluster");
		expect(_body.compute.mode).toBe("dedicated");
		expect(_body.compute.nodePool).toBeUndefined();
	});

	it("forwards the base domain only when provided", function baseDomain()
	{
		const _starter = _planById("starter");

		const _withDomain = _PlanToClusterTenantBody(_starter, { name: "acme", displayName: "Acme", baseDomain: "acme.example.com" });
		const _withoutDomain = _PlanToClusterTenantBody(_starter, { name: "acme", displayName: "Acme" });

		expect(_withDomain.baseDomain).toBe("acme.example.com");
		expect(_withoutDomain.baseDomain).toBeUndefined();
	});
});

describe("_PLAN_CATALOGUE", function catalogue()
{
	it("offers Starter and Team via self-serve but not Enterprise", function selfServeFlags()
	{
		expect(_planById("starter").selfServe).toBe(true);
		expect(_planById("team").selfServe).toBe(true);
		expect(_planById("enterprise").selfServe).toBe(false);
	});

	it("seeds the three expected isolation tiers", function tiers()
	{
		expect(_planById("starter").isolationTier).toBe("shared");
		expect(_planById("team").isolationTier).toBe("dedicatedNodes");
		expect(_planById("enterprise").isolationTier).toBe("dedicatedCluster");
	});
});
