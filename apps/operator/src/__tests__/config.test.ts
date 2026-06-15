import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _LoadOperatorConfig } from "../config.js";

/** Minimal mandatory env so `_LoadOperatorConfig` reaches the multi-instance guard. */
const _BASE_ENV: Record<string, string> = {
	TENANT_DEFAULT_IMAGE: "ghcr.io/opencrane/tenant:latest",
	INGRESS_DOMAIN: "ai.example.com",
	GATEWAY_PORT: "8080",
	IDLE_TIMEOUT_MINUTES: "30",
	IDLE_CHECK_INTERVAL_SECONDS: "60",
	LITELLM_ENABLED: "false",
	LITELLM_ENDPOINT: "http://litellm:4000",
	LITELLM_DEFAULT_MONTHLY_BUDGET_USD: "100",
};

describe("_LoadOperatorConfig multi-instance fail-closed guard (MI.1 / brief B2)", function _suite()
{
	let _saved: NodeJS.ProcessEnv;

	beforeEach(function _save()
	{
		_saved = process.env;
		process.env = { ..._BASE_ENV };
	});

	afterEach(function _restore()
	{
		process.env = _saved;
	});

	it("throws when REQUIRE_WATCH_NAMESPACE is true and WATCH_NAMESPACE is empty", function _failClosed()
	{
		process.env.WATCH_NAMESPACE = "";
		process.env.REQUIRE_WATCH_NAMESPACE = "true";
		expect(function _load() { _LoadOperatorConfig(); }).toThrow(/refusing to watch all namespaces/);
	});

	it("throws when WATCH_NAMESPACE is only whitespace under the guard", function _whitespace()
	{
		process.env.WATCH_NAMESPACE = "   ";
		process.env.REQUIRE_WATCH_NAMESPACE = "true";
		expect(function _load() { _LoadOperatorConfig(); }).toThrow(/refusing to watch all namespaces/);
	});

	it("loads a scoped namespace under the guard", function _scoped()
	{
		process.env.WATCH_NAMESPACE = "oc-acme";
		process.env.REQUIRE_WATCH_NAMESPACE = "true";
		const config = _LoadOperatorConfig();
		expect(config.watchNamespace).toBe("oc-acme");
		expect(config.requireWatchNamespace).toBe(true);
	});

	it("allows an empty watch namespace when the guard is off (legacy single-install)", function _legacy()
	{
		process.env.WATCH_NAMESPACE = "";
		// REQUIRE_WATCH_NAMESPACE unset → defaults to false.
		const config = _LoadOperatorConfig();
		expect(config.watchNamespace).toBe("");
		expect(config.requireWatchNamespace).toBe(false);
	});

	it("derives runtime-plane URL fallbacks from POD_NAMESPACE, not a shared namespace (B5)", function _podNamespaceFallback()
	{
		process.env.WATCH_NAMESPACE = "oc-acme";
		process.env.POD_NAMESPACE = "oc-acme";
		// Runtime-plane URL env vars are intentionally unset so the fallbacks are exercised.
		const config = _LoadOperatorConfig();
		expect(config.mcpGatewayUrl).toBe("http://opencrane-mcp-gateway.oc-acme.svc:8080");
		expect(config.skillRegistryUrl).toBe("http://opencrane-skill-registry.oc-acme.svc:5000");
		expect(config.controlPlaneInternalUrl).toBe("http://opencrane-control-plane.oc-acme.svc:3000");
	});

	it("falls back to the `default` namespace when POD_NAMESPACE is unset", function _defaultNamespaceFallback()
	{
		process.env.WATCH_NAMESPACE = "oc-acme";
		// POD_NAMESPACE unset → fallback host is `default`, never `opencrane-system`.
		const config = _LoadOperatorConfig();
		expect(config.mcpGatewayUrl).toBe("http://opencrane-mcp-gateway.default.svc:8080");
		expect(config.controlPlaneInternalUrl).toContain(".default.svc:");
	});
});
