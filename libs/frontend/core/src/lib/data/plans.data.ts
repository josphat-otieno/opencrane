import { Plan } from "../models/plan.types";

/** Seed subscription plan catalogue offered to WeOwnAI customers. */
export const _PLAN_CATALOGUE: readonly Plan[] =
[
	{
		id: "starter",
		name: "Starter",
		isolationTier: "shared",
		quota: { cpu: "2", memory: "4Gi", pods: 20, storage: "20Gi" },
		priceDisplay: "$49 / month",
		selfServe: true
	},
	{
		id: "team",
		name: "Team",
		isolationTier: "dedicatedNodes",
		quota: { cpu: "8", memory: "32Gi", pods: 100, storage: "200Gi" },
		priceDisplay: "$499 / month",
		selfServe: true
	},
	{
		id: "enterprise",
		name: "Enterprise",
		isolationTier: "dedicatedCluster",
		quota: { cpu: "64", memory: "256Gi", pods: 1000, storage: "2Ti", gpu: 8 },
		priceDisplay: "Custom pricing",
		selfServe: false
	}
];
