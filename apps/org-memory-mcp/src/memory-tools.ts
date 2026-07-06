import { AwarenessClient } from "@opencrane/awareness";

import { MemoryWriter } from "./memory-write.js";

/**
 * The subset of process env the org-memory MCP server reads at startup.
 * Modelled as an index map (not a named-optional interface) so `process.env`
 * assigns cleanly without TypeScript's weak-type check tripping.
 */
export type OrgMemoryEnv = Record<string, string | undefined>;

/** Parse a boolean-ish env value; unset/blank ⇒ the supplied default. */
function _envFlag(value: string | undefined, fallback: boolean): boolean
{
  const v = value?.trim().toLowerCase();
  if (v === undefined || v === "") { return fallback; }
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Build the {@link AwarenessClient} the MCP server retrieves through, from pod env.
 *
 * COGNEE_ENDPOINT is mandatory: the server exists only to serve Cognee-backed org
 * memory, so a missing endpoint is a hard error (fail loud at startup) — never a
 * silent no-op that would leave the agent believing it queried org memory when it
 * did not. This mirrors the control-plane's "COGNEE_ENDPOINT is required" contract.
 *
 * @param env - The environment to read (defaults to `process.env` at the call site).
 * @returns A configured AwarenessClient that retrieves directly from the per-tenant Cognee.
 * @throws When COGNEE_ENDPOINT is unset/blank.
 */
export function _BuildAwarenessClientFromEnv(env: OrgMemoryEnv): AwarenessClient
{
  const endpoint = env.COGNEE_ENDPOINT?.trim();
  if (!endpoint)
  {
    throw new Error("COGNEE_ENDPOINT is required for the org-memory MCP server");
  }

  const parsedLimit = env.ORG_MEMORY_DEFAULT_LIMIT ? Number.parseInt(env.ORG_MEMORY_DEFAULT_LIMIT, 10) : NaN;
  const defaultLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

  return new AwarenessClient({ cogneeEndpoint: endpoint, ...(defaultLimit ? { defaultLimit } : {}) });
}

/**
 * Build the {@link MemoryWriter} the `memory_remember` tool persists through, from pod env.
 *
 * Returns `null` when the write path is disabled (`ORG_MEMORY_WRITE_ENABLED=false`) — a fleet
 * kill-switch so operators can turn off agent writes to the shared graph without redeploying the
 * tool. When enabled (the default), the writer stamps this pod's tenant identity
 * (`OPENCLAW_TENANT_NAME`) as the fact owner so remembered facts are attributable.
 *
 * @param env - The environment to read.
 * @returns A configured MemoryWriter, or null when writes are disabled.
 * @throws When COGNEE_ENDPOINT is unset/blank.
 */
export function _BuildMemoryWriterFromEnv(env: OrgMemoryEnv): MemoryWriter | null
{
  if (!_envFlag(env.ORG_MEMORY_WRITE_ENABLED, true))
  {
    return null;
  }

  const endpoint = env.COGNEE_ENDPOINT?.trim();
  if (!endpoint)
  {
    throw new Error("COGNEE_ENDPOINT is required for the org-memory MCP server");
  }

  // Owner identity for provenance; falls back to "unknown-tenant" so a mis-provisioned pod still
  // writes attributable-ish data rather than crashing (the write itself is far more useful than
  // failing the turn over a missing label).
  const owner = env.OPENCLAW_TENANT_NAME?.trim() || "unknown-tenant";
  return new MemoryWriter({ endpoint, owner });
}
