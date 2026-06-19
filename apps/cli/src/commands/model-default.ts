import type { Command } from "commander";

import type { AutoRoutingConfig, ModelRoutingDefaultWrite } from "@opencrane/contracts";

import type { CliConfig } from "../config.js";
import { _MakeClient } from "../config.js";
import { _Print, _PrintApiError, _PrintSuccess, type OutputFormat } from "../format.js";

/** Columns shown for `oc model-default list` in table mode. */
const _LIST_COLUMNS = ["id", "scope", "clusterTenant", "defaultModel", "autoConfig"];

/** Flag values for `oc model-default list`. */
interface _ModelDefaultListOptions
{
  /** Filter to a single ClusterTenant's defaults. */
  clusterTenant?: string;
  /** Output format. */
  output: OutputFormat;
}

/** Flag values for `oc model-default set`. */
interface _ModelDefaultSetOptions
{
  /** Scope: global | clusterTenant (defaults to global server-side). */
  scope?: string;
  /** Owning ClusterTenant when scope is clusterTenant. */
  clusterTenant?: string;
  /** Default model publicModelName at this scope. */
  defaultModel?: string;
  /** Auto-routing config as a JSON string (parsed with JSON.parse). */
  autoConfig?: string;
  /** Output format. */
  output: OutputFormat;
}

/**
 * Parse an `--auto-config <json>` flag into an AutoRoutingConfig.
 * Exits cleanly via _PrintApiError-style messaging on malformed JSON so the
 * caller never sees a raw exception.
 */
function _parseAutoConfig(raw: string): AutoRoutingConfig
{
  try
  {
    return JSON.parse(raw) as AutoRoutingConfig;
  }
  catch (err)
  {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`error: --auto-config is not valid JSON — ${msg}`);
    process.exit(1);
  }
}

/** Register all `oc model-default *` sub-commands on the given parent Command. */
export function _RegisterModelDefault(parent: Command, getConfig: () => CliConfig): void
{
  const modelDefault = parent
    .command("model-default")
    .description("Manage scope-level model + auto-config defaults consulted when a skill declares no posture (list, show, set, remove)");

  modelDefault
    .command("list")
    .description("List model-routing defaults, optionally scoped to a single cluster tenant")
    .option("--cluster-tenant <id>", "Filter to one cluster tenant's defaults")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _list(opts: _ModelDefaultListOptions)
    {
      const client = _MakeClient(getConfig());
      const { data, error } = await client.GET("/model-routing/defaults", {
        params: { query: opts.clusterTenant ? { clusterTenant: opts.clusterTenant } : {} },
      });
      if (error) _PrintApiError("model-default list", error);
      _Print(data, opts.output, _LIST_COLUMNS);
    });

  modelDefault
    .command("show <id>")
    .description("Show a single model-routing default by id")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _show(id: string, opts: { output: OutputFormat })
    {
      const client = _MakeClient(getConfig());
      const { data, error } = await client.GET("/model-routing/defaults/{id}", { params: { path: { id } } });
      if (error) _PrintApiError("model-default show", error);
      _Print(data, opts.output);
    });

  modelDefault
    .command("set")
    .description("Upsert the model-routing default for a (scope, cluster-tenant) pair")
    .option("--scope <scope>", "Scope: global|clusterTenant")
    .option("--cluster-tenant <id>", "Owning cluster tenant (required when --scope clusterTenant)")
    .option("--default-model <publicModelName>", "Default model's public slug at this scope")
    .option("--auto-config <json>", "Auto-routing config as a JSON object string")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _set(opts: _ModelDefaultSetOptions)
    {
      // 1. Assemble the typed write body from the supplied flags. The scope
      //    string is passed through so the API stays the single validator.
      const body: ModelRoutingDefaultWrite = {
        ...(opts.scope ? { scope: opts.scope as ModelRoutingDefaultWrite["scope"] } : {}),
        ...(opts.clusterTenant ? { clusterTenant: opts.clusterTenant } : {}),
        ...(opts.defaultModel ? { defaultModel: opts.defaultModel } : {}),
        ...(opts.autoConfig ? { autoConfig: _parseAutoConfig(opts.autoConfig) } : {}),
      };

      // 2. PUT (upsert by scope+clusterTenant) through the generated client.
      const client = _MakeClient(getConfig());
      const { data, error } = await client.PUT("/model-routing/defaults", { body });
      if (error) _PrintApiError("model-default set", error);
      _Print(data, opts.output);
    });

  modelDefault
    .command("remove <id>")
    .description("Delete a model-routing default")
    .action(async function _remove(id: string)
    {
      const client = _MakeClient(getConfig());
      const { error } = await client.DELETE("/model-routing/defaults/{id}", { params: { path: { id } } });
      if (error) _PrintApiError("model-default remove", error);
      _PrintSuccess(`Model-routing default "${id}" removed`);
    });
}
