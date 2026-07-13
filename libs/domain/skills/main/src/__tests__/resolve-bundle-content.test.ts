import { describe, expect, it } from "vitest";

import { _ResolveBundleContent } from "../routes/internal/skill-bundles.js";
import type { OciBundleStore } from "../core/oci-bundle-store.js";

/** Minimal OciBundleStore stub exposing only pullBundle, the method under test. */
function _stubStore(pull: (digest: string) => Promise<string | null>): OciBundleStore
{
	return { pullBundle: pull } as unknown as OciBundleStore;
}

const _DIGEST = "sha256:" + "a".repeat(64);

describe("_ResolveBundleContent (P4D.2 cutover)", function _suite()
{
	it("serves OCI content when the store has the blob", async function _ociHit()
	{
		const store = _stubStore(function _pull() { return Promise.resolve("from-oci"); });
		expect(await _ResolveBundleContent(store, _DIGEST, "from-db")).toBe("from-oci");
	});

	it("falls back to DB content when the store has no blob (null)", async function _ociMiss()
	{
		const store = _stubStore(function _pull() { return Promise.resolve(null); });
		expect(await _ResolveBundleContent(store, _DIGEST, "from-db")).toBe("from-db");
	});

	it("falls back to DB content when the store throws (registry error / digest mismatch)", async function _ociThrows()
	{
		const store = _stubStore(function _pull() { return Promise.reject(new Error("digest mismatch")); });
		expect(await _ResolveBundleContent(store, _DIGEST, "from-db")).toBe("from-db");
	});

	it("uses DB content directly when no store is configured", async function _noStore()
	{
		expect(await _ResolveBundleContent(null, _DIGEST, "from-db")).toBe("from-db");
	});

	it("returns null when neither source has content", async function _neither()
	{
		const store = _stubStore(function _pull() { return Promise.resolve(null); });
		expect(await _ResolveBundleContent(store, _DIGEST, null)).toBeNull();
	});
});
