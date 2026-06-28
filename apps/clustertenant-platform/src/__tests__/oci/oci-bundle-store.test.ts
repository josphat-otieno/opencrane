import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { OciBundleStore } from "../../core/oci/oci-bundle-store.js";
import type { OciFetch, OciRequestInit, OciResponse } from "../../core/oci/oci-bundle-store.types.js";

/** Build an OciResponse stub. */
function _res(status: number, opts: { body?: string; location?: string } = {}): OciResponse
{
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get(name: string) { return name.toLowerCase() === "location" ? (opts.location ?? null) : null; } },
		text() { return Promise.resolve(opts.body ?? ""); },
	};
}

/** sha256:<hex> of a string, matching the store's digest scheme. */
function _digest(content: string): string
{
	return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

/** A recording mock transport that emulates an OCI registry. `blobs` seeds GET-by-digest. */
function _mockFetch(blobs: Record<string, string> = {}): { fetchFn: OciFetch; calls: Array<{ url: string; method: string }> }
{
	const calls: Array<{ url: string; method: string }> = [];
	const fetchFn: OciFetch = function _fetch(url: string, init?: OciRequestInit)
	{
		const method = init?.method ?? "GET";
		calls.push({ url, method });

		// Blob GET by digest — serve seeded content or 404.
		const blobMatch = method === "GET" && url.includes("/blobs/sha256:");
		if (blobMatch)
		{
			const digest = url.slice(url.indexOf("/blobs/") + "/blobs/".length);
			return Promise.resolve(digest in blobs ? _res(200, { body: blobs[digest] }) : _res(404));
		}

		// Upload session open.
		if (method === "POST" && url.endsWith("/blobs/uploads/"))
		{
			return Promise.resolve(_res(202, { location: "/v2/skills/blobs/uploads/abc123" }));
		}
		// Blob/manifest PUT.
		if (method === "PUT")
		{
			return Promise.resolve(_res(201));
		}
		return Promise.resolve(_res(500));
	};
	return { fetchFn, calls };
}

describe("OciBundleStore", function _suite()
{
	it("pushes a bundle as blob uploads + a manifest and returns its digest", async function _push()
	{
		const { fetchFn, calls } = _mockFetch();
		const store = new OciBundleStore({ registryUrl: "http://zot:5000/", repository: "skills", fetchFn });

		const result = await store.pushBundle("# Skill\nbody");

		expect(result.digest).toBe(_digest("# Skill\nbody"));
		expect(result.size).toBe(Buffer.byteLength("# Skill\nbody", "utf8"));
		// Two blobs (layer + empty config) each = POST + PUT, plus one manifest PUT.
		expect(calls.filter(c => c.method === "POST").length).toBe(2);
		expect(calls.filter(c => c.method === "PUT").length).toBe(3);
		expect(calls.some(c => c.method === "PUT" && c.url.includes("/manifests/"))).toBe(true);
	});

	it("pulls a bundle by digest and verifies the bytes", async function _pull()
	{
		const content = "# Skill\nbody";
		const digest = _digest(content);
		const { fetchFn } = _mockFetch({ [digest]: content });
		const store = new OciBundleStore({ registryUrl: "http://zot:5000", repository: "skills", fetchFn });

		expect(await store.pullBundle(digest)).toBe(content);
	});

	it("returns null when the blob is absent (404)", async function _missing()
	{
		const { fetchFn } = _mockFetch();
		const store = new OciBundleStore({ registryUrl: "http://zot:5000", repository: "skills", fetchFn });

		expect(await store.pullBundle(_digest("absent"))).toBeNull();
	});

	it("rejects bytes that do not hash to the requested digest", async function _tampered()
	{
		const askedDigest = _digest("original");
		// Registry returns DIFFERENT content under the requested digest (tamper/corruption).
		const { fetchFn } = _mockFetch({ [askedDigest]: "tampered" });
		const store = new OciBundleStore({ registryUrl: "http://zot:5000", repository: "skills", fetchFn });

		await expect(store.pullBundle(askedDigest)).rejects.toThrow(/digest mismatch/);
	});

	it("rejects a malformed digest before hitting the registry", async function _badDigest()
	{
		const { fetchFn, calls } = _mockFetch();
		const store = new OciBundleStore({ registryUrl: "http://zot:5000", repository: "skills", fetchFn });

		await expect(store.pullBundle("sha256:not-hex&evil=1")).rejects.toThrow(/Invalid OCI digest/);
		expect(calls.length).toBe(0);
	});

	it("treats a manifest re-push (HTTP 200) as success, keeping push idempotent", async function _repush()
	{
		const calls: Array<{ url: string; method: string }> = [];
		const fetchFn: OciFetch = function _fetch(url: string, init?: OciRequestInit)
		{
			const method = init?.method ?? "GET";
			calls.push({ url, method });
			if (method === "POST") return Promise.resolve(_res(202, { location: "/v2/skills/blobs/uploads/x" }));
			if (method === "PUT" && url.includes("/manifests/")) return Promise.resolve(_res(200)); // already exists
			if (method === "PUT") return Promise.resolve(_res(201));
			return Promise.resolve(_res(500));
		};
		const store = new OciBundleStore({ registryUrl: "http://zot:5000", repository: "skills", fetchFn });

		await expect(store.pushBundle("# Skill")).resolves.toMatchObject({ digest: _digest("# Skill") });
	});

	it("refuses an upload Location that leaves the registry origin", async function _hostileLocation()
	{
		const fetchFn: OciFetch = function _fetch(_url: string, init?: OciRequestInit)
		{
			if ((init?.method ?? "GET") === "POST") return Promise.resolve(_res(202, { location: "http://evil.example/steal" }));
			return Promise.resolve(_res(201));
		};
		const store = new OciBundleStore({ registryUrl: "http://zot:5000", repository: "skills", fetchFn });

		await expect(store.pushBundle("# Skill")).rejects.toThrow(/outside the registry origin/);
	});

	it("rejects an invalid registry URL at construction", function _badRegistry()
	{
		expect(() => new OciBundleStore({ registryUrl: "not a url", repository: "skills" })).toThrow(/Invalid OCI registryUrl/);
	});
});
