import { describe, expect, it } from "vitest";

import { defaultConfig, _makeTenant } from "../fixtures.js";
import { _BuildConfigMap } from "../../tenants/deploy/index.js";
import { _OpenclawConfigSchema } from "../../tenants/deploy/openclaw-config.schema.js";

/**
 * Schema contract test for the rendered `openclaw.json` (task_d611ab4d, S1).
 *
 * OpenClaw's config schema is **strict** — an unknown key crashes the pod on boot
 * (the `trustNothing`-class crash fixed in f6afafd, where the operator leaked an
 * internal flag into the `gateway` block). Earlier this test was a no-dependency
 * structural allowlist because OpenClaw ships as a container, not an npm dep, so
 * its schema wasn't vendored. We now validate the rendered config against a
 * VENDORED zod mirror of OpenClaw's documented schema
 * (`openclaw-config.schema.ts`, pinned to OpenClaw 2026.6.x), which rejects stray
 * keys exactly as the live gateway does — covering the same regression class with
 * a real schema instead of a hand-maintained key list.
 */
describe("openclaw.json render contract — zod schema (task_d611ab4d)", function _suite()
{
  function _renderRaw(tenant = _makeTenant("contract")): string
  {
    const configMap = _BuildConfigMap(defaultConfig, tenant, "default");
    return configMap.data?.["openclaw.json"] ?? "{}";
  }

  function _renderConfig(tenant = _makeTenant("contract")): Record<string, unknown>
  {
    return JSON.parse(_renderRaw(tenant)) as Record<string, unknown>;
  }

  it("validates the default rendered config against the OpenClaw zod schema", function _schemaOk()
  {
    const parsed = _OpenclawConfigSchema.safeParse(_renderConfig());
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
  });

  it("validates the LiteLLM-enabled config (models block) against the schema", function _modelsOk()
  {
    // Exercise the optional `models` branch so the provider/mode shape is covered.
    const liteLlmConfig = { ...defaultConfig, liteLlmEnabled: true };
    const configMap = _BuildConfigMap(liteLlmConfig, _makeTenant("contract"), "default");
    const parsed = _OpenclawConfigSchema.safeParse(JSON.parse(configMap.data?.["openclaw.json"] ?? "{}"));
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues, null, 2)).toBe(true);
  });

  it("validates the Cognee-wired config (mcp.servers block) against the schema", function _mcpOk()
  {
    // Exercise the optional `mcp` branch so the local org-memory stdio server shape is covered.
    const cogneeConfig = { ...defaultConfig, cogneeEndpoint: "http://cognee:8000" };
    const configMap = _BuildConfigMap(cogneeConfig, _makeTenant("contract"), "default");
    const parsed = _OpenclawConfigSchema.safeParse(JSON.parse(configMap.data?.["openclaw.json"] ?? "{}"));
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues, null, 2)).toBe(true);
  });

  it("disables MCP idle eviction (sessionIdleTtlMs=0) so org-memory never idle-respawns", function _idleTtl()
  {
    // openclaw evicts an idle bundled MCP runtime after mcp.sessionIdleTtlMs (default 10min) and
    // re-spawns on next use, racing its own connect -> -32000. 0 keeps the org-memory stdio server
    // warm for the pod's life. Rendered only when Cognee is wired (the org-memory branch).
    const cogneeConfig = { ...defaultConfig, cogneeEndpoint: "http://cognee:8000" };
    const config = JSON.parse(_BuildConfigMap(cogneeConfig, _makeTenant("contract"), "default").data?.["openclaw.json"] ?? "{}") as Record<string, unknown>;
    const mcp = config["mcp"] as Record<string, unknown>;
    expect(mcp["sessionIdleTtlMs"]).toBe(0);
    expect((mcp["servers"] as Record<string, unknown>)["org-memory"]).toBeTruthy();
  });

  it("never leaks the internal trustNothing flag into the gateway block", function _noTrustNothing()
  {
    // The exact f6afafd regression: trustNothing is operator-internal, not an
    // OpenClaw key, so it must never appear anywhere in the rendered config and
    // the strict gateway schema would reject it if it did.
    expect(_renderRaw()).not.toContain("trustNothing");
  });

  it("rejects a stray key injected into the gateway block (regression guard)", function _strayKey()
  {
    // Tamper the rendered config the way the f6afafd bug did and prove the schema
    // fails closed — this is what protects the live pod from an unknown gateway key.
    const config = _renderConfig();
    (config["gateway"] as Record<string, unknown>)["trustNothing"] = true;
    expect(_OpenclawConfigSchema.safeParse(config).success).toBe(false);
  });

  it("pins the gateway to the owner email via allowUsers", function _ownerPin()
  {
    // CONN.10 — the operator-emitted config scopes the pod to its owner.
    const config = _renderConfig();
    const auth = (config["gateway"] as Record<string, unknown>)["auth"] as Record<string, unknown>;
    const trustedProxy = auth["trustedProxy"] as { allowUsers: string[] };
    expect(trustedProxy.allowUsers).toEqual(["contract@example.com"]);
  });

  it("pins gateway.reload to hot so a config rewrite never restart-respawns MCP servers", function _reloadHot()
  {
    // openclaw@2026.6.11 `gateway.reload`: `hot` keeps every apply in-process, so the entrypoint's
    // openclaw.json rewrites never escalate to a full gateway restart (which would re-spawn the
    // stdio org-memory server and re-open the -32000 spawn race). debounceMs > OpenClaw's 300
    // default coalesces burst rewrites into one apply.
    const gateway = _renderConfig()["gateway"] as Record<string, unknown>;
    const reload = gateway["reload"] as { mode: string; debounceMs: number };
    expect(reload.mode).toBe("hot");
    expect(reload.debounceMs).toBeGreaterThan(300);
    expect(_OpenclawConfigSchema.safeParse(_renderConfig()).success).toBe(true);
  });
});

/**
 * C1 — a tenant `configOverrides.gateway` must NOT clobber the platform-owned
 * gateway block. Step 3b of `_BuildConfigMap` re-pins `baseConfig.gateway` after
 * the tenant merge, so a gateway override can never drop the owner-pin (CONN.10)
 * or inject a stray key that crashes the strict gateway schema.
 */
describe("configOverrides cannot clobber the platform gateway (C1)", function _c1Suite()
{
  function _render(overrides: Record<string, unknown>): Record<string, unknown>
  {
    const tenant = _makeTenant("contract", { configOverrides: overrides });
    const configMap = _BuildConfigMap(defaultConfig, tenant, "default");
    return JSON.parse(configMap.data?.["openclaw.json"] ?? "{}") as Record<string, unknown>;
  }

  it("ignores a malicious gateway override (no stray key, owner-pin preserved)", function _gatewayOverride()
  {
    // A tenant tries to replace the gateway block: it drops allowUsers AND injects a
    // stray key. After the re-pin, neither must survive.
    const config = _render({
      gateway: {
        mode: "local",
        port: 18789,
        bind: "lan",
        trustedProxies: ["0.0.0.0/0"],
        auth: { mode: "trusted-proxy", trustedProxy: { userHeader: "X-Forwarded-User" } },
        // Stray key + a malicious wide-open trustedProxies + missing allowUsers.
        trustNothing: true,
      },
    });

    const gateway = config["gateway"] as Record<string, unknown>;
    const auth = gateway["auth"] as Record<string, unknown>;
    const trustedProxy = auth["trustedProxy"] as { allowUsers: string[] };

    // 1. Owner-pin survives — the override's missing allowUsers did not win.
    expect(trustedProxy.allowUsers).toEqual(["contract@example.com"]);
    // 2. The stray key is gone — the platform block was restored verbatim.
    expect(gateway).not.toHaveProperty("trustNothing");
    // 3. The platform trustedProxies (fixture default), not the wide-open override, applies.
    expect(gateway["trustedProxies"]).toEqual(["10.0.0.0/8"]);
    // 4. The result still validates against the strict OpenClaw schema.
    expect(_OpenclawConfigSchema.safeParse(config).success).toBe(true);
  });

  it("still applies a non-gateway override", function _nonGatewayOverride()
  {
    // A non-platform top-level override must pass through untouched.
    const config = _render({ telemetry: { enabled: false } });
    expect(config["telemetry"]).toEqual({ enabled: false });

    // ...and the gateway block is still the platform-owned one.
    const auth = (config["gateway"] as Record<string, unknown>)["auth"] as Record<string, unknown>;
    const trustedProxy = auth["trustedProxy"] as { allowUsers: string[] };
    expect(trustedProxy.allowUsers).toEqual(["contract@example.com"]);
  });
});

/**
 * Reasoning visibility — `agents.defaults.reasoningDefault`/`thinkingDefault` make
 * the model's thinking stream live AND persist into `chat.history` (rendered as a
 * collapsible "Thinking" card in the org-admin SPA). They are DEFAULTS a tenant
 * can override, not platform-pinned like the gateway block.
 */
describe("reasoning visibility defaults", function _reasoningSuite()
{
  function _render(overrides?: Record<string, unknown>): Record<string, unknown>
  {
    const tenant = _makeTenant("contract", overrides ? { configOverrides: overrides } : undefined);
    return JSON.parse(_BuildConfigMap(defaultConfig, tenant, "default").data?.["openclaw.json"] ?? "{}") as Record<string, unknown>;
  }

  function _defaults(config: Record<string, unknown>): Record<string, unknown>
  {
    return (config["agents"] as Record<string, unknown>)["defaults"] as Record<string, unknown>;
  }

  it("enables reasoning by default so it lands in history", function _default()
  {
    const defaults = _defaults(_render());
    expect(defaults["reasoningDefault"]).toBe("stream");
    expect(defaults["thinkingDefault"]).toBe("medium");
    expect(_OpenclawConfigSchema.safeParse(_render()).success).toBe(true);
  });

  it("lets a tenant override reasoning off to save tokens", function _override()
  {
    const config = _render({ agents: { defaults: { reasoningDefault: "off" } } });
    const defaults = _defaults(config);
    expect(defaults["reasoningDefault"]).toBe("off"); // tenant wins over the platform default
    expect(defaults["workspace"]).toBe("/data/openclaw/workspace"); // platform-pinned keys still applied
    expect(_OpenclawConfigSchema.safeParse(config).success).toBe(true);
  });
});
