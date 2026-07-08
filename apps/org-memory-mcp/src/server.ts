import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AwarenessClient } from "@opencrane/awareness";

import { _FormatAwarenessResult } from "./format.js";
import type { MemoryWriter } from "./memory-write.js";

/**
 * The MCP server name OpenClaw registers this local memory tool under. Kept in one
 * place so the operator's `openclaw.json` `mcp.servers` key and this server agree.
 */
export const ORG_MEMORY_SERVER_NAME = "org-memory";

/** Server version reported in the MCP handshake (independent of the npm package version). */
const _SERVER_VERSION = "0.1.0";

/** Hard cap on requested hits, defence-in-depth against a runaway `limit`. */
const _MAX_LIMIT = 50;

/**
 * How many times a transient `memory_search` is attempted in-process before it gives up
 * and hands the agent a retry signal, and the base (linear) backoff between attempts.
 *
 * Retrieval is safe to retry: `AwarenessClient.query` is a read, so a duplicated attempt
 * has no side effect. Writes (`memory_remember`) are deliberately NOT retried here — a
 * partially-applied Cognee `/v1/add` must never be silently duplicated.
 */
const _SEARCH_MAX_ATTEMPTS = 3;
const _SEARCH_BACKOFF_MS = 400;

/** Real wall-clock sleep; injectable so tests exercise the retry loop with zero delay. */
const _defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `op`, retrying on ANY thrown error up to `attempts` times with linear backoff.
 * Returns the first success; rethrows the last error once attempts are exhausted so the
 * caller can turn it into an agent-facing signal.
 *
 * @param op    - The idempotent async operation to attempt.
 * @param opts  - Attempt count, base backoff, and the sleep function to wait between tries.
 */
async function _withRetry<T>(op: () => Promise<T>, opts: { attempts: number; backoffMs: number; sleep: (ms: number) => Promise<void> }): Promise<T>
{
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt += 1)
  {
    try
    {
      return await op();
    }
    catch (error)
    {
      lastError = error;
      if (attempt < opts.attempts) { await opts.sleep(opts.backoffMs * attempt); }
    }
  }
  throw lastError;
}

/**
 * Build the org-memory MCP server: a LOCAL, in-pod tool OpenClaw spawns over stdio
 * to retrieve org context per turn. It is deliberately NOT routed through the Obot
 * MCP gateway — org-memory retrieval is a first-class platform capability that talks
 * directly to the per-tenant Cognee (no control-plane mediation in the hot path).
 *
 * The `memory_search` tool wraps {@link AwarenessClient}, so every result the agent
 * sees inherits the SDK's guarantees: enforced citations, dropped-uncitable accounting,
 * and contract-version stamping. When a {@link MemoryWriter} is supplied, a
 * `memory_remember` tool is also registered so the agent can PROMOTE a generalizable
 * learning up into the shared graph (omit the writer — or disable it via env — to run
 * read-only). Both deps are injected so the server is unit-testable with no live backend.
 *
 * @param deps - The awareness client (read), optional memory writer (remember), and an
 *   optional `sleep` override so tests can drive the search-retry loop without real waits.
 * @returns A configured (not yet connected) MCP server; the caller attaches a transport.
 */
export function _BuildOrgMemoryServer(deps: { client: AwarenessClient; writer?: MemoryWriter | null; sleep?: (ms: number) => Promise<void> }): McpServer
{
  const { client, writer } = deps;
  const sleep = deps.sleep ?? _defaultSleep;
  const server = new McpServer({ name: ORG_MEMORY_SERVER_NAME, version: _SERVER_VERSION });

  server.registerTool(
    "memory_search",
    {
      title: "Search organisational memory",
      description:
        "Retrieve organisational memory — company documents, prior decisions, and project facts — " +
        "from the Cognee knowledge graph. Results are scope-aware, permission-filtered, and every " +
        "one carries a citation. Prefer this over your personal MEMORY.md for org-wide facts.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language question or keywords to look up in org memory."),
        datasets: z
          .array(z.string())
          .optional()
          .describe("Optional Cognee dataset scopes to restrict to (e.g. 'org', 'team/platform'). Omit to search everything this tenant is entitled to."),
        limit: z
          .number()
          .int()
          .positive()
          .max(_MAX_LIMIT)
          .optional()
          .describe("Maximum number of results to return."),
      },
    },
    async function _handleMemorySearch({ query, datasets, limit })
    {
      try
      {
        // Retry transient blips in-process first — a cold Cognee or a spawn-time hiccup
        // usually clears within a couple of attempts, so the agent gets results rather
        // than a spurious "unavailable" on the first flake.
        const result = await _withRetry(
          () => client.query({ query, ...(datasets ? { datasets } : {}), ...(limit ? { limit } : {}) }),
          { attempts: _SEARCH_MAX_ATTEMPTS, backoffMs: _SEARCH_BACKOFF_MS, sleep },
        );
        return { content: [{ type: "text" as const, text: _FormatAwarenessResult(result) }] };
      }
      catch (error)
      {
        // In-process retries are exhausted. Hand the agent an EXPLICIT, honest retry signal
        // so it waits and calls memory_search again rather than inventing an error, an index
        // status, or a remediation command it cannot actually run (a real observed failure mode).
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text:
            `Org-memory search is temporarily unavailable (${message}). This is usually a brief ` +
            `startup or backend hiccup — wait a few seconds and call memory_search again. Do NOT invent ` +
            `an error, an index status, or a remediation command; if it keeps failing after you retry, ` +
            `tell the user org memory is temporarily unavailable and an operator should check the pod.` }],
          isError: true,
        };
      }
    },
  );

  // Write path — registered only when a writer is provided (env kill-switch off ⇒ read-only pod).
  if (writer)
  {
    server.registerTool(
      "memory_remember",
      {
        title: "Remember to organisational memory",
        description:
          "Persist a GENERALIZABLE, reusable fact to shared org memory (Cognee) so OTHER agents can " +
          "retrieve it later. Use for durable org/domain knowledge and decisions. Do NOT use it for " +
          "your personal style, this user's preferences, or transient task state — those belong in your " +
          "personal MEMORY.md. Give a clear title and the correct scope; the fact is attributed to you.",
        inputSchema: {
          content: z.string().min(1).describe("The fact/learning to persist, self-contained enough to be useful out of context."),
          title: z.string().min(1).describe("A short title so the fact is citable when later retrieved."),
          scope: z
            .enum(["org", "team", "department", "project", "personal"])
            .describe("Which shared scope this belongs to. Use the narrowest scope that fits."),
          subject: z
            .string()
            .optional()
            .describe("Subject for scoped datasets (e.g. the team/department/project name). Required for team, department, and project."),
          sensitivityTags: z.array(z.string()).optional().describe("Optional sensitivity tags to carry into org memory."),
        },
      },
      async function _handleMemoryRemember({ content, title, scope, subject, sensitivityTags })
      {
        try
        {
          const { dataset } = await writer.remember({ content, title, scope, ...(subject ? { subject } : {}), ...(sensitivityTags ? { sensitivityTags } : {}) });
          return { content: [{ type: "text" as const, text: `Remembered to org memory (dataset: ${dataset}).` }] };
        }
        catch (error)
        {
          // Validation errors (e.g. missing subject) and backend/ACL rejections both land here as a
          // tool error, so the agent gets an actionable message instead of the turn crashing.
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text" as const, text: `Org-memory remember failed: ${message}` }], isError: true };
        }
      },
    );
  }

  return server;
}
