import type { Command } from "commander";

import type { CliConfig } from "../config.js";
import { makeClient } from "../config.js";
import { print, printApiError, printSuccess, type OutputFormat } from "../format.js";

/** Register all `oc budget *` sub-commands on the given parent Command. */
export function registerBudget(parent: Command, getConfig: () => CliConfig): void
{
  const budget = parent
    .command("budget")
    .description("Manage AI budgets and LiteLLM virtual keys (global, per-account, per-tenant spend)");

  budget
    .command("global")
    .description("Get the global monthly spend ceiling")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _global(opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/ai-budget/global");
      if (error) printApiError("budget global", error);
      print(data, opts.output);
    });

  budget
    .command("set-global <usd>")
    .description("Set the global monthly spend ceiling in USD")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _setGlobal(usd: string, opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.PUT("/ai-budget/global", {
        body: { monthlyLimitUsd: Number(usd) },
      });
      if (error) printApiError("budget set-global", error);
      print(data, opts.output);
    });

  budget
    .command("accounts")
    .description("List all per-account monthly spend ceilings")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _accounts(opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/ai-budget/accounts");
      if (error) printApiError("budget accounts", error);
      print(data, opts.output);
    });

  budget
    .command("set-account <userId> <usd>")
    .description("Set the monthly budget ceiling for a specific account")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _setAccount(userId: string, usd: string, opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.PUT("/ai-budget/accounts/{userId}", {
        params: { path: { userId } },
        body: { monthlyLimitUsd: Number(usd) },
      });
      if (error) printApiError("budget set-account", error);
      print(data, opts.output);
    });

  budget
    .command("remove-account <userId>")
    .description("Remove the per-account budget ceiling")
    .action(async function _removeAccount(userId: string)
    {
      const client = makeClient(getConfig());
      const { error } = await client.DELETE("/ai-budget/accounts/{userId}", {
        params: { path: { userId } },
      });
      if (error) printApiError("budget remove-account", error);
      printSuccess(`Budget ceiling for account "${userId}" removed`);
    });

  budget
    .command("spend <tenant>")
    .description("Get current spend and budget state for a tenant")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _spend(tenant: string, opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/ai-budget/{tenantName}/spend", {
        params: { path: { tenantName: tenant } },
      });
      if (error) printApiError("budget spend", error);
      print(data, opts.output);
    });

  budget
    .command("key <tenant>")
    .description("Get LiteLLM virtual key metadata for a tenant (key value never returned)")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _key(tenant: string, opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/ai-budget/{tenantName}/litellm-key", {
        params: { path: { tenantName: tenant } },
      });
      if (error) printApiError("budget key", error);
      print(data, opts.output);
    });

  budget
    .command("revoke-key <tenant>")
    .description("Revoke the LiteLLM virtual key for a tenant")
    .action(async function _revokeKey(tenant: string)
    {
      const client = makeClient(getConfig());
      const { error } = await client.POST("/ai-budget/{tenantName}/litellm-key/revoke", {
        params: { path: { tenantName: tenant } },
      });
      if (error) printApiError("budget revoke-key", error);
      printSuccess(`LiteLLM key for tenant "${tenant}" revoked`);
    });
}
