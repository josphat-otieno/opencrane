import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ClusterTenantIsolationTier } from "@opencrane/contracts";

import { _ReadClusterTenantSeedConfig } from "../../infra/cluster-tenant-seed.js";

/** Seed env vars this suite mutates, snapshotted so each test starts clean. */
const _ENV_KEYS = [
	"OPENCRANE_SEED_CLUSTER_TENANT_NAME",
	"OPENCRANE_SEED_CLUSTER_TENANT_DISPLAY_NAME",
	"OPENCRANE_SEED_CLUSTER_TENANT_OWNER_EMAIL",
	"OPENCRANE_SEED_CLUSTER_TENANT_TIER",
] as const;

describe("_ReadClusterTenantSeedConfig (Chunk 4 — single-tenant seed)", function _suite()
{
	/** Saved env values restored after each test. */
	const saved: Record<string, string | undefined> = {};

	beforeEach(function _snapshot()
	{
		for (const key of _ENV_KEYS)
		{
			saved[key] = process.env[key];
			delete process.env[key];
		}
	});

	afterEach(function _restore()
	{
		for (const key of _ENV_KEYS)
		{
			if (saved[key] === undefined) { delete process.env[key]; }
			else { process.env[key] = saved[key]; }
		}
	});

	it("returns an empty name (no seed) when the env is unset — the multi-tenant default", function _noSeed()
	{
		const config = _ReadClusterTenantSeedConfig();
		expect(config.name).toBe("");
	});

	it("trims the name and defaults the display name to the name", function _defaults()
	{
		process.env.OPENCRANE_SEED_CLUSTER_TENANT_NAME = "  acme  ";
		const config = _ReadClusterTenantSeedConfig();
		expect(config.name).toBe("acme");
		expect(config.displayName).toBe("acme");
		expect(config.ownerEmail).toBe("");
		expect(config.isolationTier).toBe(ClusterTenantIsolationTier.Shared);
	});

	it("lowercases and trims the owner email so it matches the verified email at login", function _ownerEmail()
	{
		process.env.OPENCRANE_SEED_CLUSTER_TENANT_NAME = "acme";
		process.env.OPENCRANE_SEED_CLUSTER_TENANT_OWNER_EMAIL = "  Owner@Acme.Example  ";
		expect(_ReadClusterTenantSeedConfig().ownerEmail).toBe("owner@acme.example");
	});

	it("accepts a valid tier and falls back to shared on an unknown value", function _tier()
	{
		process.env.OPENCRANE_SEED_CLUSTER_TENANT_NAME = "acme";
		process.env.OPENCRANE_SEED_CLUSTER_TENANT_TIER = "dedicatedNodes";
		expect(_ReadClusterTenantSeedConfig().isolationTier).toBe(ClusterTenantIsolationTier.DedicatedNodes);

		process.env.OPENCRANE_SEED_CLUSTER_TENANT_TIER = "bogus";
		expect(_ReadClusterTenantSeedConfig().isolationTier).toBe(ClusterTenantIsolationTier.Shared);
	});
});
