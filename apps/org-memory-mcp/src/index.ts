#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { _BuildAwarenessClientFromEnv, _BuildMemoryWriterFromEnv } from "./memory-tools.js";
import { _BuildOrgMemoryServer, ORG_MEMORY_SERVER_NAME } from "./server.js";

/**
 * Stdio entrypoint for the org-memory MCP server.
 *
 * OpenClaw spawns this process per tenant pod (via the `mcp.servers.org-memory`
 * `command`/`args` entry the operator renders into `openclaw.json`) and speaks MCP
 * to it over stdio. Because stdio IS the JSON-RPC channel, all diagnostics MUST go
 * to stderr — a stray stdout write would corrupt the protocol stream.
 */
async function _main(): Promise<void>
{
  const client = _BuildAwarenessClientFromEnv(process.env);
  const writer = _BuildMemoryWriterFromEnv(process.env);
  const server = _BuildOrgMemoryServer({ client, writer });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const tools = writer ? "memory_search + memory_remember" : "memory_search (read-only)";
  process.stderr.write(`[${ORG_MEMORY_SERVER_NAME}] connected over stdio; ${tools}; Cognee ${process.env.COGNEE_ENDPOINT}\n`);
}

_main().catch(function _fatal(error: unknown)
{
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[${ORG_MEMORY_SERVER_NAME}] fatal: ${message}\n`);
  process.exit(1);
});
