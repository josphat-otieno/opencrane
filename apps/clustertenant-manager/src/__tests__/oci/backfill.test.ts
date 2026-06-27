import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { _BackfillBundlesToOci } from "../../core/oci/oci-backfill.js";
import type { OciBundleStore } from "../../core/oci/oci-bundle-store.js";

/** Build a Prisma stub whose skillBundle.findMany returns the given published rows. */
function _prismaWith(rows: Array<Record<string, unknown>>): PrismaClient
{
	return {
		skillBundle: { findMany: vi.fn().mockResolvedValue(rows) },
	} as unknown as PrismaClient;
}

/** Build an OciBundleStore stub whose pushBundle is driven by the given function. */
function _storeWith(push: (content: string) => Promise<{ digest: string; size: number }>): OciBundleStore
{
	return { pushBundle: push } as unknown as OciBundleStore;
}

const _DIGEST_A = "sha256:" + "a".repeat(64);
const _DIGEST_B = "sha256:" + "b".repeat(64);

describe("_BackfillBundlesToOci (P4D.2 backfill)", function _suite()
{
	it("pushes a published bundle whose content matches its recorded digest", async function _pushes()
	{
		const prisma = _prismaWith([{ id: "b1", name: "alpha", digest: _DIGEST_A, content: "# alpha" }]);
		const store = _storeWith(function _push() { return Promise.resolve({ digest: _DIGEST_A, size: 7 }); });

		const summary = await _BackfillBundlesToOci(prisma, store);

		expect(summary.total).toBe(1);
		expect(summary.pushed).toBe(1);
		expect(summary.results[0].outcome).toBe("pushed");
	});

	it("skips a bundle that has no DB content", async function _skips()
	{
		const prisma = _prismaWith([{ id: "b1", name: "empty", digest: _DIGEST_A, content: null }]);
		const pushSpy = vi.fn();
		const store = _storeWith(pushSpy);

		const summary = await _BackfillBundlesToOci(prisma, store);

		expect(summary.skipped).toBe(1);
		expect(summary.results[0].outcome).toBe("skipped");
		// A skipped bundle must never reach the registry.
		expect(pushSpy).not.toHaveBeenCalled();
	});

	it("marks a bundle failed when its content hashes to a different digest than recorded", async function _mismatch()
	{
		const prisma = _prismaWith([{ id: "b1", name: "drift", digest: _DIGEST_A, content: "# drift" }]);
		// Store hashes the content to B, but the bundle records A — delivery looks up A,
		// so the pushed blob would be an orphan: this must be reported as a failure.
		const store = _storeWith(function _push() { return Promise.resolve({ digest: _DIGEST_B, size: 7 }); });

		const summary = await _BackfillBundlesToOci(prisma, store);

		expect(summary.failed).toBe(1);
		expect(summary.results[0].outcome).toBe("failed");
		expect(summary.results[0].reason).toContain("digest mismatch");
	});

	it("isolates a push error to its bundle and still completes the run", async function _isolatesError()
	{
		const prisma = _prismaWith([
			{ id: "b1", name: "boom", digest: _DIGEST_A, content: "# boom" },
			{ id: "b2", name: "ok", digest: _DIGEST_B, content: "# ok" },
		]);
		const store = _storeWith(function _push(content)
		{
			if (content === "# boom") { return Promise.reject(new Error("registry down")); }
			return Promise.resolve({ digest: _DIGEST_B, size: 4 });
		});

		const summary = await _BackfillBundlesToOci(prisma, store);

		expect(summary.total).toBe(2);
		expect(summary.failed).toBe(1);
		expect(summary.pushed).toBe(1);
		expect(summary.results[0].outcome).toBe("failed");
		expect(summary.results[0].reason).toBe("registry down");
		expect(summary.results[1].outcome).toBe("pushed");
	});

	it("returns an empty summary when there are no published bundles", async function _empty()
	{
		const prisma = _prismaWith([]);
		const store = _storeWith(function _push() { return Promise.resolve({ digest: _DIGEST_A, size: 0 }); });

		const summary = await _BackfillBundlesToOci(prisma, store);

		expect(summary).toEqual({ total: 0, pushed: 0, skipped: 0, failed: 0, results: [] });
	});
});
