import { describe, expect, it } from "vitest";

import { _RenderDns01ClusterIssuer, _RenderDnsCredentialsSecret } from "../../core/platform-dns/cluster-issuer.js";
import type { DnsProviderConfig } from "../../core/platform-dns/cluster-issuer.types.js";

/** Build a base config with optional overrides. */
function _config(overrides: Partial<DnsProviderConfig> = {}): DnsProviderConfig
{
	return { provider: "cloudflare", zone: "ai.elewa.ke", email: "ops@elewa.ke", issuerName: "opencrane-issuer", ...overrides };
}

/** Narrow a rendered ClusterIssuer to the acme fields under test. */
function _acme(issuer: Record<string, unknown>): { server: string; solvers: Array<{ dns01: Record<string, Record<string, unknown>> }> }
{
	return (issuer.spec as { acme: { server: string; solvers: Array<{ dns01: Record<string, Record<string, unknown>> }> } }).acme;
}

describe("_RenderDnsCredentialsSecret (CONN.8a)", function _suite()
{
	it("returns null when no token is supplied", function _none()
	{
		expect(_RenderDnsCredentialsSecret(_config(), "cert-manager")).toBeNull();
	});

	it("renders an Opaque Secret with the token in stringData", function _token()
	{
		const secret = _RenderDnsCredentialsSecret(_config({ apiToken: "cf-tok" }), "cert-manager");
		expect(secret).not.toBeNull();
		expect(secret?.name).toBe("opencrane-dns01-cloudflare");
		expect(secret?.namespace).toBe("cert-manager");
		expect((secret?.manifest as { stringData: Record<string, string> }).stringData["api-token"]).toBe("cf-tok");
	});
});

describe("_RenderDns01ClusterIssuer (CONN.8a)", function _suite()
{
	it("wires cloudflare apiTokenSecretRef to the credentials Secret", function _cf()
	{
		const acme = _acme(_RenderDns01ClusterIssuer(_config({ apiToken: "x" }), "opencrane-dns01-cloudflare"));
		expect(acme.solvers[0].dns01.cloudflare.apiTokenSecretRef).toEqual({ name: "opencrane-dns01-cloudflare", key: "api-token" });
		// Default ACME server applied when none supplied.
		expect(acme.server).toContain("letsencrypt.org");
	});

	it("uses digitalocean tokenSecretRef", function _do()
	{
		const acme = _acme(_RenderDns01ClusterIssuer(_config({ provider: "digitalocean", apiToken: "x" }), "opencrane-dns01-digitalocean"));
		expect((acme.solvers[0].dns01.digitalocean.tokenSecretRef as { name: string }).name).toBe("opencrane-dns01-digitalocean");
	});

	it("renders a raw solverConfig verbatim for non-token providers (rfc2136)", function _rfc()
	{
		const acme = _acme(_RenderDns01ClusterIssuer(_config({ provider: "rfc2136", solverConfig: { nameserver: "10.0.0.1:53" } }), null));
		expect(acme.solvers[0].dns01.rfc2136).toEqual({ nameserver: "10.0.0.1:53" });
	});

	it("honours a custom ACME server", function _server()
	{
		const acme = _acme(_RenderDns01ClusterIssuer(_config({ apiToken: "x", server: "https://acme-staging.example/dir" }), "s"));
		expect(acme.server).toBe("https://acme-staging.example/dir");
	});

	it("throws when a token provider has no token", function _noTok()
	{
		expect(function _call() { _RenderDns01ClusterIssuer(_config(), null); }).toThrow(/requires an apiToken/);
	});

	it("throws when a non-token provider has no solverConfig", function _noCfg()
	{
		expect(function _call() { _RenderDns01ClusterIssuer(_config({ provider: "route53" }), null); }).toThrow(/requires a solverConfig/);
	});
});
