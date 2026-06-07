#!/usr/bin/env node
/**
 * oc — OpenCrane CLI
 *
 * Authentication:
 *   Set OPENCRANE_TOKEN or pass --token <token>
 *
 * Server:
 *   Set OPENCRANE_URL or pass --url <url> (default: http://localhost:8080)
 *
 * Output:
 *   Pass --output json to any command for machine-readable output.
 *   Pipe to jq for filtering: oc tenants list --output json | jq '.[].name'
 *
 * Auth note:
 *   Bearer token auth is the supported path for Phase 5.
 *   OIDC and projected ServiceAccount tokens are documented in AGENTS.md
 *   and are the planned long-term authentication paths.
 */

import { Command } from "commander";

import { type CliConfig, resolveConfig } from "./config.js";
import { registerAudit } from "./commands/audit.js";
import { registerBudget } from "./commands/budget.js";
import { registerMcpServers } from "./commands/mcp-servers.js";
import { registerPolicies } from "./commands/policies.js";
import { registerProviders } from "./commands/providers.js";
import { registerSkills } from "./commands/skills.js";
import { registerTenants } from "./commands/tenants.js";
import { registerTokens } from "./commands/tokens.js";

const program = new Command();

program
  .name("oc")
  .description("OpenCrane platform CLI — manage tenants, policies, budgets, MCP servers, and skills")
  .version("0.1.0")
  .option("--url <url>", "Control-plane base URL (overrides OPENCRANE_URL)", undefined)
  .option("--token <token>", "Bearer token (overrides OPENCRANE_TOKEN)", undefined);

// Lazy config resolution so --help still works without a token set.
let _config: CliConfig | undefined;

function getConfig(): CliConfig
{
  if (!_config)
  {
    const opts = program.opts<{ url?: string; token?: string }>();
    _config = resolveConfig(opts);
  }
  return _config;
}

// Register all command groups.
registerTenants(program, getConfig);
registerPolicies(program, getConfig);
registerMcpServers(program, getConfig);
registerSkills(program, getConfig);
registerBudget(program, getConfig);
registerAudit(program, getConfig);
registerTokens(program, getConfig);
registerProviders(program, getConfig);

program.parseAsync(process.argv).catch(function _onError(err: unknown)
{
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
