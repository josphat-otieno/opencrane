#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { _BuildAwarenessClientFromEnv, _BuildMemoryWriterFromEnv } from "./memory-tools.js";
import { _BuildOrgMemoryServer, ORG_MEMORY_SERVER_NAME } from "./server.js";

/** Attempts to establish the stdio transport before giving up, and the base linear backoff. */
const _STARTUP_MAX_ATTEMPTS = 5;
const _STARTUP_BACKOFF_MS = 500;

/** Wall-clock sleep between connect attempts. */
const _sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stdio entrypoint for the org-memory MCP server.
 *
 * OpenClaw spawns this process per tenant pod (via the `mcp.servers.org-memory`
 * `command`/`args` entry the operator renders into `openclaw.json`) and speaks MCP
 * to it over stdio. Because stdio IS the JSON-RPC channel, all diagnostics MUST go
 * to stderr — a stray stdout write would corrupt the protocol stream.
 *
 * The connect is retried with backoff: the runtime's stdio spawn can transiently fail
 * the handshake under cold-start pressure (observed as OpenClaw logging
 * `MCP error -32000: Connection closed`), so a single flake should self-heal rather than
 * leave the tenant with no `memory_search` tool for the life of the pod. A fresh transport
 * is used per attempt because a failed one may have half-bound the process streams.
 * (A parent that has already torn down the pipe can only be recovered by OpenClaw
 * re-spawning us — that retry is upstream; this loop covers connect-time failures.)
 */
async function _main(): Promise<void>
{
  const client = _BuildAwarenessClientFromEnv(process.env);
  const writer = _BuildMemoryWriterFromEnv(process.env);
  const server = _BuildOrgMemoryServer({ client, writer });
  const tools = writer ? "memory_search + memory_remember" : "memory_search (read-only)";

  let lastError: unknown;
  for (let attempt = 1; attempt <= _STARTUP_MAX_ATTEMPTS; attempt += 1)
  {
    try
    {
      await server.connect(new StdioServerTransport());
      process.stderr.write(`[${ORG_MEMORY_SERVER_NAME}] connected over stdio (attempt ${attempt}); ${tools}; Cognee ${process.env.COGNEE_ENDPOINT}\n`);
      return;
    }
    catch (error)
    {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[${ORG_MEMORY_SERVER_NAME}] connect attempt ${attempt}/${_STARTUP_MAX_ATTEMPTS} failed: ${message}\n`);
      if (attempt < _STARTUP_MAX_ATTEMPTS) { await _sleep(_STARTUP_BACKOFF_MS * attempt); }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

_main().catch(function _fatal(error: unknown)
{
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[${ORG_MEMORY_SERVER_NAME}] fatal: ${message}\n`);
  process.exit(1);
});
