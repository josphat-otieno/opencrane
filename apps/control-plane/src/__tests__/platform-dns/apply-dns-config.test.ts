import type * as k8s from "@kubernetes/client-node";
import { describe, expect, it, vi } from "vitest";

import { _ApplyPlatformDnsConfig } from "../../core/platform-dns/apply-dns-config.js";
import type { DnsProviderConfig } from "../../core/platform-dns/cluster-issuer.types.js";

/** A 409 error matching the client's conflict shape. */
const _CONFLICT = Object.assign(new Error("already exists"), { code: 409 });

function _config(overrides: Partial<DnsProviderConfig> = {}): DnsProviderConfig
{
	return { provider: "cloudflare", zone: "ai.elewa.ke", email: "ops@elewa.ke", issuerName: "opencrane-issuer", apiToken: "cf-tok", ...overrides };
}

describe("_ApplyPlatformDnsConfig (CONN.8a)", function _suite()
{
	it("creates the credentials Secret then the ClusterIssuer for a token provider", async function _create()
	{
		const createNamespacedSecret = vi.fn().mockResolvedValue({});
		const createClusterCustomObject = vi.fn().mockResolvedValue({});
		const coreApi = { createNamespacedSecret } as unknown as k8s.CoreV1Api;
		const customApi = { createClusterCustomObject } as unknown as k8s.CustomObjectsApi;

		const result = await _ApplyPlatformDnsConfig(customApi, coreApi, _config(), "cert-manager");

		expect(createNamespacedSecret).toHaveBeenCalledWith(expect.objectContaining({ namespace: "cert-manager" }));
		expect(createClusterCustomObject).toHaveBeenCalledWith(expect.objectContaining({ group: "cert-manager.io", plural: "clusterissuers" }));
		expect(result).toEqual({ issuerName: "opencrane-issuer", provider: "cloudflare", zone: "ai.elewa.ke", secretName: "opencrane-dns01-cloudflare" });
	});

	it("replaces both resources on 409 conflict (idempotent re-apply / token rotation)", async function _conflict()
	{
		const createNamespacedSecret = vi.fn().mockRejectedValue(_CONFLICT);
		const replaceNamespacedSecret = vi.fn().mockResolvedValue({});
		const createClusterCustomObject = vi.fn().mockRejectedValue(_CONFLICT);
		const getClusterCustomObject = vi.fn().mockResolvedValue({ metadata: { resourceVersion: "42" } });
		const replaceClusterCustomObject = vi.fn().mockResolvedValue({});
		const coreApi = { createNamespacedSecret, replaceNamespacedSecret } as unknown as k8s.CoreV1Api;
		const customApi = { createClusterCustomObject, getClusterCustomObject, replaceClusterCustomObject } as unknown as k8s.CustomObjectsApi;

		await _ApplyPlatformDnsConfig(customApi, coreApi, _config(), "cert-manager");

		expect(replaceNamespacedSecret).toHaveBeenCalledOnce();
		// Replace must carry the live resourceVersion fetched from the existing issuer.
		expect(replaceClusterCustomObject).toHaveBeenCalledWith(expect.objectContaining({ name: "opencrane-issuer" }));
		const body = replaceClusterCustomObject.mock.calls[0][0].body as { metadata: { resourceVersion?: string } };
		expect(body.metadata.resourceVersion).toBe("42");
	});

	it("skips the Secret for a non-token provider and reports secretName null", async function _noSecret()
	{
		const createNamespacedSecret = vi.fn().mockResolvedValue({});
		const createClusterCustomObject = vi.fn().mockResolvedValue({});
		const coreApi = { createNamespacedSecret } as unknown as k8s.CoreV1Api;
		const customApi = { createClusterCustomObject } as unknown as k8s.CustomObjectsApi;

		const result = await _ApplyPlatformDnsConfig(customApi, coreApi, _config({ provider: "rfc2136", apiToken: undefined, solverConfig: { nameserver: "10.0.0.1:53" } }), "cert-manager");

		expect(createNamespacedSecret).not.toHaveBeenCalled();
		expect(result.secretName).toBeNull();
	});
});
