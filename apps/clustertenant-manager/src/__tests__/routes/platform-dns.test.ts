import type * as k8s from "@kubernetes/client-node";
import express from "express";
import type { Express } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { platformDnsRouter } from "../../routes/platform-dns.js";

/** A 404 error matching the client's not-found shape. */
const _NOT_FOUND = Object.assign(new Error("not found"), { code: 404 });

/** Mount the platform-dns router with injected K8s client stubs. */
function _buildApp(customApi: k8s.CustomObjectsApi, coreApi: k8s.CoreV1Api): Express
{
	const app = express();
	app.use(express.json());
	app.use("/platform/dns", platformDnsRouter(customApi, coreApi));
	return app;
}

describe("platform-dns router (CONN.8a)", function _suite()
{
	// The router resolves issuer kind/namespace from env at construction; clear the
	// MI.4 overrides after every case so cluster-mode cases stay default-clean.
	afterEach(function _resetEnv()
	{
		delete process.env.PLATFORM_DNS_ISSUER_KIND;
		delete process.env.PLATFORM_DNS_ISSUER_NAMESPACE;
	});

	it("PUT applies the issuer for a token provider and returns the summary (no token echoed)", async function _put()
	{
		const customApi = { createClusterCustomObject: vi.fn().mockResolvedValue({}) } as unknown as k8s.CustomObjectsApi;
		const coreApi = { createNamespacedSecret: vi.fn().mockResolvedValue({}) } as unknown as k8s.CoreV1Api;
		const app = _buildApp(customApi, coreApi);

		const res = await request(app).put("/platform/dns").send({ provider: "cloudflare", zone: "ai.elewa.ke", email: "ops@elewa.ke", apiToken: "cf-secret" });

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ status: "configured", provider: "cloudflare", zone: "ai.elewa.ke", secretName: "opencrane-dns01-cloudflare" });
		// The token must never appear anywhere in the response body.
		expect(JSON.stringify(res.body)).not.toContain("cf-secret");
	});

	it("PUT rejects missing required fields with 400", async function _missing()
	{
		const app = _buildApp({} as k8s.CustomObjectsApi, {} as k8s.CoreV1Api);
		const res = await request(app).put("/platform/dns").send({ provider: "cloudflare" });
		expect(res.status).toBe(400);
		expect(res.body.code).toBe("VALIDATION_ERROR");
	});

	it("PUT maps a provider misconfiguration to 422 (token provider, no token)", async function _misconfig()
	{
		const app = _buildApp({} as k8s.CustomObjectsApi, {} as k8s.CoreV1Api);
		const res = await request(app).put("/platform/dns").send({ provider: "cloudflare", zone: "ai.elewa.ke", email: "ops@elewa.ke" });
		expect(res.status).toBe(422);
		expect(res.body.code).toBe("DNS_PROVIDER_MISCONFIGURED");
	});

	it("GET reports configured:false when the issuer is absent (404)", async function _getAbsent()
	{
		const customApi = { getClusterCustomObject: vi.fn().mockRejectedValue(_NOT_FOUND) } as unknown as k8s.CustomObjectsApi;
		const app = _buildApp(customApi, {} as k8s.CoreV1Api);
		const res = await request(app).get("/platform/dns");
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ configured: false, issuerName: "opencrane-issuer" });
	});

	it("GET summarises the configured issuer's provider/email without secrets", async function _getConfigured()
	{
		const issuer = { spec: { acme: { email: "ops@elewa.ke", server: "https://acme/dir", solvers: [{ dns01: { cloudflare: { apiTokenSecretRef: { name: "s", key: "api-token" } } } }] } } };
		const customApi = { getClusterCustomObject: vi.fn().mockResolvedValue(issuer) } as unknown as k8s.CustomObjectsApi;
		const app = _buildApp(customApi, {} as k8s.CoreV1Api);
		const res = await request(app).get("/platform/dns");
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ configured: true, issuerName: "opencrane-issuer", issuerKind: "ClusterIssuer", issuerNamespace: null, provider: "cloudflare", email: "ops@elewa.ke", server: "https://acme/dir" });
	});

	it("GET propagates a non-404 lookup error instead of masking it as unconfigured", async function _getError()
	{
		const customApi = { getClusterCustomObject: vi.fn().mockRejectedValue(Object.assign(new Error("forbidden"), { code: 403 })) } as unknown as k8s.CustomObjectsApi;
		const app = _buildApp(customApi, {} as k8s.CoreV1Api);
		// No error-handler middleware mounted → an unhandled rejection surfaces as 500.
		const res = await request(app).get("/platform/dns");
		expect(res.status).toBe(500);
	});

	it("PUT targets a namespaced Issuer in the pod namespace when PLATFORM_DNS_ISSUER_KIND=Issuer (MI.4)", async function _putNamespaced()
	{
		process.env.PLATFORM_DNS_ISSUER_KIND = "Issuer";
		process.env.PLATFORM_DNS_ISSUER_NAMESPACE = "oc-acme";
		const createNamespacedCustomObject = vi.fn().mockResolvedValue({});
		const createNamespacedSecret = vi.fn().mockResolvedValue({});
		const customApi = { createNamespacedCustomObject } as unknown as k8s.CustomObjectsApi;
		const coreApi = { createNamespacedSecret } as unknown as k8s.CoreV1Api;
		const app = _buildApp(customApi, coreApi);

		const res = await request(app).put("/platform/dns").send({ provider: "cloudflare", zone: "ai.elewa.ke", email: "ops@elewa.ke", apiToken: "cf-secret" });

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ status: "configured", issuerKind: "Issuer", issuerNamespace: "oc-acme" });
		expect(createNamespacedCustomObject).toHaveBeenCalledWith(expect.objectContaining({ namespace: "oc-acme", plural: "issuers" }));
		expect(createNamespacedSecret).toHaveBeenCalledWith(expect.objectContaining({ namespace: "oc-acme" }));
	});

	it("GET reads back the namespaced Issuer when PLATFORM_DNS_ISSUER_KIND=Issuer (MI.4)", async function _getNamespaced()
	{
		process.env.PLATFORM_DNS_ISSUER_KIND = "Issuer";
		process.env.PLATFORM_DNS_ISSUER_NAMESPACE = "oc-acme";
		const issuer = { spec: { acme: { email: "ops@elewa.ke", server: "https://acme/dir", solvers: [{ dns01: { cloudflare: { apiTokenSecretRef: { name: "s", key: "api-token" } } } }] } } };
		const getNamespacedCustomObject = vi.fn().mockResolvedValue(issuer);
		const customApi = { getNamespacedCustomObject } as unknown as k8s.CustomObjectsApi;
		const app = _buildApp(customApi, {} as k8s.CoreV1Api);

		const res = await request(app).get("/platform/dns");

		expect(res.status).toBe(200);
		expect(getNamespacedCustomObject).toHaveBeenCalledWith(expect.objectContaining({ namespace: "oc-acme", plural: "issuers", name: "opencrane-issuer" }));
		expect(res.body).toEqual({ configured: true, issuerName: "opencrane-issuer", issuerKind: "Issuer", issuerNamespace: "oc-acme", provider: "cloudflare", email: "ops@elewa.ke", server: "https://acme/dir" });
	});
});
