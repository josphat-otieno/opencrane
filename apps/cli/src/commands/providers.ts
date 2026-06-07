import type { Command } from "commander";

import type { CliConfig } from "../config.js";
import { makeClient } from "../config.js";
import { print, printApiError, printSuccess, type OutputFormat } from "../format.js";

/** Register all `oc providers *` sub-commands on the given parent Command. */
export function registerProviders(parent: Command, getConfig: () => CliConfig): void
{
  const providers = parent
    .command("providers")
    .description("Manage provider API keys (list, set, delete)");

  providers
    .command("list")
    .description("List configured provider keys (configured status only, key value never returned)")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _list(opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/providers/keys");
      if (error) printApiError("providers list", error);
      print(data, opts.output, ["provider", "configured", "updatedAt"]);
    });

  providers
    .command("set <provider> <key>")
    .description("Create or update a provider API key (openai, claude, etc.)")
    .action(async function _set(provider: string, key: string)
    {
      const client = makeClient(getConfig());
      const { error } = await client.PUT("/providers/keys", {
        body: { provider, apiKey: key },
      });
      if (error) printApiError("providers set", error);
      printSuccess(`Provider key for "${provider}" updated`);
    });

  providers
    .command("delete <provider>")
    .description("Delete a configured provider API key")
    .action(async function _delete(provider: string)
    {
      const client = makeClient(getConfig());
      const { error } = await client.DELETE("/providers/keys/{provider}", {
        params: { path: { provider } },
      });
      if (error) printApiError("providers delete", error);
      printSuccess(`Provider key for "${provider}" deleted`);
    });
}
