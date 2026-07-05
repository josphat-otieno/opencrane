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
 * @param deps - The awareness client (read) and optional memory writer (remember).
 * @returns A configured (not yet connected) MCP server; the caller attaches a transport.
 */
export function _BuildOrgMemoryServer(deps: { client: AwarenessClient; writer?: MemoryWriter | null }): McpServer
{
  const { client, writer } = deps;
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
        const result = await client.query({ query, ...(datasets ? { datasets } : {}), ...(limit ? { limit } : {}) });
        return { content: [{ type: "text" as const, text: _FormatAwarenessResult(result) }] };
      }
      catch (error)
      {
        // Surface the failure to the agent as a tool error rather than throwing, so the
        // turn continues with a clear "memory unavailable" signal instead of crashing.
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Org-memory search failed: ${message}` }], isError: true };
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
