import type { Command } from "commander";

import type { CliConfig } from "../config.js";
import { makeClient } from "../config.js";
import { print, printApiError, printSuccess, type OutputFormat } from "../format.js";

/** Register all `oc tenants *` sub-commands on the given parent Command. */
export function registerTenants(parent: Command, getConfig: () => CliConfig): void
{
  const tenants = parent
    .command("tenants")
    .description("Manage tenants (list, create, update, delete, suspend, resume, datasets, contract)");

  tenants
    .command("list")
    .description("List all tenants")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _list(opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/tenants");
      if (error) printApiError("tenants list", error);
      print(data, opts.output, ["name", "phase", "email", "team", "ingressHost", "createdAt"]);
    });

  tenants
    .command("get <name>")
    .description("Get a single tenant by name")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _get(name: string, opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/tenants/{name}", { params: { path: { name } } });
      if (error) printApiError("tenants get", error);
      print(data, opts.output);
    });

  tenants
    .command("create")
    .description("Create a new tenant")
    .requiredOption("--name <name>", "Tenant name (must be a valid DNS label)")
    .requiredOption("--display-name <displayName>", "Human-readable display name")
    .requiredOption("--email <email>", "Contact email for the tenant")
    .option("--team <team>", "Team name")
    .option("--budget <usd>", "Monthly budget ceiling in USD")
    .option("--policy-ref <policyRef>", "AccessPolicy name to attach")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _create(opts: {
      name: string;
      displayName: string;
      email: string;
      team?: string;
      budget?: string;
      policyRef?: string;
      output: OutputFormat;
    })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.POST("/tenants", {
        body: {
          name: opts.name,
          displayName: opts.displayName,
          email: opts.email,
          ...(opts.team ? { team: opts.team } : {}),
          ...(opts.budget ? { monthlyBudgetUsd: Number(opts.budget) } : {}),
          ...(opts.policyRef ? { policyRef: opts.policyRef } : {}),
        },
      });
      if (error) printApiError("tenants create", error);
      print(data, opts.output);
    });

  tenants
    .command("update <name>")
    .description("Update a tenant")
    .option("--display-name <displayName>", "New display name")
    .option("--email <email>", "New contact email")
    .option("--team <team>", "New team name")
    .option("--budget <usd>", "New monthly budget ceiling in USD")
    .option("--policy-ref <policyRef>", "New AccessPolicy name")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _update(name: string, opts: {
      displayName?: string;
      email?: string;
      team?: string;
      budget?: string;
      policyRef?: string;
      output: OutputFormat;
    })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.PUT("/tenants/{name}", {
        params: { path: { name } },
        body: {
          ...(opts.displayName ? { displayName: opts.displayName } : {}),
          ...(opts.email ? { email: opts.email } : {}),
          ...(opts.team ? { team: opts.team } : {}),
          ...(opts.budget ? { monthlyBudgetUsd: Number(opts.budget) } : {}),
          ...(opts.policyRef ? { policyRef: opts.policyRef } : {}),
        },
      });
      if (error) printApiError("tenants update", error);
      print(data, opts.output);
    });

  tenants
    .command("delete <name>")
    .description("Delete a tenant")
    .action(async function _delete(name: string)
    {
      const client = makeClient(getConfig());
      const { error } = await client.DELETE("/tenants/{name}", { params: { path: { name } } });
      if (error) printApiError("tenants delete", error);
      printSuccess(`Tenant "${name}" deleted`);
    });

  tenants
    .command("suspend <name>")
    .description("Suspend a tenant (scale deployment to zero)")
    .action(async function _suspend(name: string)
    {
      const client = makeClient(getConfig());
      const { error } = await client.POST("/tenants/{name}/suspend", { params: { path: { name } } });
      if (error) printApiError("tenants suspend", error);
      printSuccess(`Tenant "${name}" suspended`);
    });

  tenants
    .command("resume <name>")
    .description("Resume a suspended tenant")
    .action(async function _resume(name: string)
    {
      const client = makeClient(getConfig());
      const { error } = await client.POST("/tenants/{name}/resume", { params: { path: { name } } });
      if (error) printApiError("tenants resume", error);
      printSuccess(`Tenant "${name}" resumed`);
    });

  tenants
    .command("datasets <name>")
    .description("Get dataset memberships for a tenant")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _datasets(name: string, opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/tenants/{name}/datasets", { params: { path: { name } } });
      if (error) printApiError("tenants datasets", error);
      print(data, opts.output);
    });

  tenants
    .command("contract <name>")
    .description("Get the effective awareness/MCP/skill contract for a tenant")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _contract(name: string, opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/tenants/{name}/effective-contract", { params: { path: { name } } });
      if (error) printApiError("tenants contract", error);
      print(data, opts.output);
    });

  tenants
    .command("drift")
    .description("Report projection drift between Tenant CRDs and database")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _drift(opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/tenants/drift");
      if (error) printApiError("tenants drift", error);
      print(data, opts.output);
    });

  tenants
    .command("repair")
    .description("Repair Tenant projection rows from CRD source of truth")
    .option("--apply", "Apply changes (default is dry-run)", false)
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _repair(opts: { apply: boolean; output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.POST("/tenants/repair", {
        params: { query: { dryRun: !opts.apply } },
      });
      if (error) printApiError("tenants repair", error);
      print(data, opts.output);
    });
}
