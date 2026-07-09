import { z } from "zod";

/**
 * Vendored zod schema for the `openclaw.json` the operator emits, used to
 * validate the rendered config in the contract test (task_d611ab4d).
 *
 * PINNED OpenClaw version: 2026.6.x (operator `config.ts` `defaultOpenclawVersion`
 * = "2026.6.11"). OpenClaw is shipped as a container image, not an npm dependency,
 * so its canonical schema is not importable; this file VENDORS a strict best-effort
 * mirror of the documented config schema for the subset of keys the operator emits.
 *
 * Source (researched 2026-06-25 from primary OpenClaw docs):
 *   - https://docs.openclaw.ai/gateway/configuration-reference
 *   - https://docs.openclaw.ai/gateway/configuration
 *   - https://docs.openclaw.ai/gateway/trusted-proxy-auth
 *
 * What is PINNED vs INFERRED:
 *   - PINNED (verbatim from docs): gateway.mode ∈ {local,remote}; gateway.bind ∈
 *     {auto,loopback,lan,tailnet,custom}; gateway.auth.mode ∈
 *     {none,token,password,trusted-proxy}; models.mode ∈ {merge,replace}. The docs
 *     state OpenClaw "only accepts configurations that fully match the schema —
 *     unknown keys cause the gateway to refuse to start", so every object below is
 *     `.strict()` (unknown keys rejected). This is exactly the `trustNothing`-class
 *     regression that crashed live tenants (f6afafd).
 *   - INFERRED (best-effort, not byte-for-byte from the canonical JSON Schema): the
 *     exact optionality/typing of `trustedProxy.userHeader`/`allowUsers`, the
 *     `models.providers.*` field set (baseUrl/apiKey/api/models), and the
 *     `agents.defaults` shape. These mirror what the operator emits and the
 *     documented field names; widen them here if OpenClaw's `openclaw config schema`
 *     output later proves a looser shape.
 */

/** Bind modes the OpenClaw gateway accepts (docs: configuration-reference). */
const _bindMode = z.enum(["auto", "loopback", "lan", "tailnet", "custom"]);

/** Auth modes the OpenClaw gateway accepts (docs: configuration-reference). */
const _authMode = z.enum(["none", "token", "password", "trusted-proxy"]);

/**
 * Trusted-proxy auth block. INFERRED optionality: the operator always emits both
 * keys, but the docs describe `allowUsers` as an optional allowlist, so it is
 * `.optional()` here while `userHeader` is required (the operator pins it).
 */
const _trustedProxySchema = z
  .object({
    /** Header the trusted proxy injects with the authenticated user identity. */
    userHeader: z.string().min(1),
    /** Allowlist of users (emails) the gateway will accept from the proxy. */
    allowUsers: z.array(z.string()).optional(),
  })
  .strict();

/**
 * Gateway auth block. The operator only ever emits `trusted-proxy`; the schema
 * still admits the documented modes so the enum stays faithful to OpenClaw.
 */
const _authSchema = z
  .object({
    /** Auth strategy the gateway uses. */
    mode: _authMode,
    /** Trusted-proxy settings, present when `mode === "trusted-proxy"`. */
    trustedProxy: _trustedProxySchema.optional(),
  })
  .strict();

/**
 * Control-UI (browser operator surface) block. With `bind:lan` the gateway enforces a
 * browser Origin allowlist, and a device-less trusted-proxy session keeps its operator
 * scopes only when device auth is explicitly disabled (the platform is device-less by
 * design — see `_BuildConfigMap`). Both keys are optional; `allowedOrigins` is host-derived.
 */
const _controlUiSchema = z
  .object({
    /** Browser Origins allowed to open a Control-UI WS (e.g. `https://<org>.<base>`). */
    allowedOrigins: z.array(z.string()).optional(),
    /** Trust the proxy as the auth authority instead of per-browser device identity. */
    dangerouslyDisableDeviceAuth: z.boolean().optional(),
  })
  .strict();

/**
 * PLATFORM-OWNED gateway block. `.strict()` is the load-bearing guarantee: an
 * unknown key here is the exact class of bug that crashed live tenant pods on boot.
 */
const _gatewaySchema = z
  .object({
    /** Gateway run mode. */
    mode: z.enum(["local", "remote"]),
    /** Multiplexed WS+HTTP port. */
    port: z.number().int().positive(),
    /** Network bind scope. */
    bind: _bindMode,
    /** Browser operator-UI policy (origin allowlist + device-auth posture). */
    controlUi: _controlUiSchema.optional(),
    /** Reverse-proxy source IPs/CIDRs trusted for trusted-proxy auth. */
    trustedProxies: z.array(z.string()),
    /** Delegated-auth configuration. */
    auth: _authSchema,
  })
  .strict();

/**
 * A single model provider entry. INFERRED field set mirrors what the operator
 * emits for the `litellm-proxy` provider (baseUrl/apiKey/api/models).
 */
const _modelProviderSchema = z
  .object({
    /** Provider base URL (e.g. the LiteLLM proxy endpoint). */
    baseUrl: z.string().optional(),
    /** Provider API key, supports `${ENV}` interpolation. */
    apiKey: z.string().optional(),
    /** Wire protocol the provider speaks (e.g. `openai-completions`). */
    api: z.string().optional(),
    /**
     * Allowed models. OpenClaw@2026.6.9 requires each entry to be an OBJECT with
     * `id` + `name` (both required) — a bare string array fails gateway startup
     * ("models.providers.*.models.N: Invalid input"). `[]` keeps the proxy default.
     * `passthrough` tolerates the extra optional per-model fields OpenClaw accepts
     * (api/baseUrl/cost/contextWindow/…) without pinning them here.
     */
    models: z
      .array(z.object({ id: z.string(), name: z.string() }).passthrough())
      .optional(),
  })
  .strict();

/**
 * Models block emitted only when LiteLLM is enabled. `mode` ∈ {merge,replace}.
 * NOTE: OpenClaw's `models` block is strict and has NO `default` key — the effective
 * default model lives at `agents.defaults.model` (see `_agentsDefaultsSchema`). Emitting
 * `models.default` fails gateway startup with "models: Invalid input".
 */
const _modelsSchema = z
  .object({
    /** How the provider map merges with built-in providers. */
    mode: z.enum(["merge", "replace"]),
    /** Provider id → provider config map. */
    providers: z.record(z.string(), _modelProviderSchema),
  })
  .strict();

/**
 * Agent defaults the operator pins. INFERRED shape (workspace path + skipBootstrap);
 * `.passthrough()` is deliberate here because a tenant MAY add its own
 * `agents.defaults.*` keys (the operator merges them in step 4 of `_BuildConfigMap`),
 * unlike the strictly platform-owned gateway block.
 */
const _agentsDefaultsSchema = z
  .object({
    /** Persistent workspace path inside the tenant pod. */
    workspace: z.string(),
    /** Skip the interactive bootstrap ritual in the headless pod. */
    skipBootstrap: z.boolean(),
    /** Effective default model id (OpenClaw reads the default from here, not models.default). */
    model: z.string().optional(),
    /** Reasoning visibility default (openclaw AgentDefaultsConfig); "stream" persists the trace into history. */
    reasoningDefault: z.enum(["off", "on", "stream"]).optional(),
    /** Default thinking level (openclaw AgentDefaultsConfig) so reasoning-capable models produce a trace. */
    thinkingDefault: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "adaptive", "max"]).optional(),
  })
  .passthrough();

/**
 * Agents block. `.passthrough()` mirrors the gateway/agents asymmetry: tenants may
 * extend agents config, so only the platform-pinned `defaults` keys are asserted.
 */
const _agentsSchema = z
  .object({
    /** Default agent settings applied to every agent in the pod. */
    defaults: _agentsDefaultsSchema,
  })
  .passthrough();

/**
 * A single `mcp.servers` entry. INFERRED shape (docs: configuration-reference): a LOCAL
 * server uses `command` + `args` (stdio transport); a REMOTE server uses `url` + `transport`
 * ("streamable-http"/"sse"). Common optional fields (headers, toolFilter, timeouts) are tolerated
 * via `.passthrough()` rather than pinned. The operator no longer emits any local server (memory
 * moved to the Cognee plugin); this remains only for tenant-declared `mcp.servers`.
 */
const _mcpServerSchema = z
  .object({
    /** Executable to spawn for a local stdio server (e.g. `node`). */
    command: z.string().optional(),
    /** Arguments for the spawned local server. */
    args: z.array(z.string()).optional(),
    /** Endpoint URL for a remote server. */
    url: z.string().optional(),
    /** Remote transport kind. */
    transport: z.enum(["streamable-http", "sse"]).optional(),
  })
  .passthrough();

/**
 * MCP block. Optional — the operator no longer emits it (memory moved to the Cognee plugin), but a
 * tenant MAY declare its own `mcp.servers` via configOverrides, so the schema still admits it.
 * `.passthrough()` at the block level tolerates any sibling MCP keys OpenClaw accepts.
 */
const _mcpSchema = z
  .object({
    /** Server id → server config map. */
    servers: z.record(z.string(), _mcpServerSchema),
  })
  .passthrough();

/**
 * Plugins block (openclaw `plugins`). The operator renders this to run the official Cognee memory
 * plugin as the EXCLUSIVE memory-slot owner (see 2-config-map.ts): `allow` is the security allowlist
 * (array), `slots.memory` names the owning plugin, `entries` toggles/configures each plugin (built-in
 * `memory-core` disabled; `cognee-openclaw` enabled + multi-scope config). `.passthrough()` — each
 * plugin's `config` surface is the plugin's own and is not pinned here.
 */
const _pluginsSchema = z
  .object({
    /** Security allowlist of plugin ids permitted to load (array form is required by OpenClaw). */
    allow: z.array(z.string()).optional(),
    /** Capability slot → owning plugin id (e.g. `{ memory: "cognee-openclaw" }`). */
    slots: z.record(z.string(), z.string()).optional(),
    /** Plugin id → `{ enabled, config }` entry. */
    entries: z.record(z.string(), z.object({ enabled: z.boolean().optional() }).passthrough()).optional(),
  })
  .passthrough();

/**
 * Top-level `openclaw.json` schema for the operator-emitted config. `.passthrough()`
 * at the root tolerates tenant `configOverrides` adding non-platform top-level keys
 * (which is supported), while the nested `gateway` block stays `.strict()` — exactly
 * the override-can't-clobber-gateway contract C1 enforces.
 */
export const _OpenclawConfigSchema = z
  .object({
    /** Platform-owned gateway block (never overridable by a tenant). */
    gateway: _gatewaySchema,
    /** Optional models block (present only when LiteLLM is enabled). */
    models: _modelsSchema.optional(),
    /** Agents block carrying the platform-pinned defaults. */
    agents: _agentsSchema,
    /** Platform-owned plugins block — runs the Cognee memory plugin as the memory-slot owner. */
    plugins: _pluginsSchema.optional(),
    /** Optional MCP block (only when a tenant declares its own `mcp.servers`). */
    mcp: _mcpSchema.optional(),
    /**
     * Platform-owned `meta` stub (always `{}`) — satisfies OpenClaw@2026.6.11's config-integrity
     * guard (`hasConfigMeta` = presence-only check), which otherwise flags our externally-written
     * config as suspicious on the next read and silently reverts to the gateway's last-known-good
     * `.bak` snapshot. `.passthrough()` since OpenClaw's own writes may add sub-fields here.
     */
    meta: z.object({}).passthrough().optional(),
  })
  .passthrough();
