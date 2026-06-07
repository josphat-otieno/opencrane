import type { Command } from "commander";

import type { CliConfig } from "../config.js";
import { makeClient } from "../config.js";
import { print, printApiError, printSuccess, type OutputFormat } from "../format.js";

/** Register all `oc skills *` sub-commands on the given parent Command. */
export function registerSkills(parent: Command, getConfig: () => CliConfig): void
{
  const skills = parent
    .command("skills")
    .description("Manage skill bundles in the catalog (list, get, create, update, delete)");

  skills
    .command("list")
    .description("List all skill bundles with entitlements and promotion history")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _list(opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/skills/catalog");
      if (error) printApiError("skills list", error);
      print(data, opts.output, ["id", "name", "scope", "status", "version", "digest"]);
    });

  skills
    .command("get <id>")
    .description("Get a single skill bundle by identifier")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _get(id: string, opts: { output: OutputFormat })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/skills/catalog/{id}", { params: { path: { id } } });
      if (error) printApiError("skills get", error);
      print(data, opts.output);
    });

  skills
    .command("create")
    .description("Create a new skill bundle")
    .requiredOption("--name <name>", "Bundle name")
    .requiredOption("--version <version>", "Semantic version (e.g. 1.0.0)")
    .requiredOption("--digest <digest>", "Immutable OCI digest (sha256:...)")
    .option("--scope <scope>", "Scope: org|team|project|personal", "org")
    .option("--description <desc>", "Human-readable description")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--body <json>", "Full JSON payload (overrides individual flags)")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _create(opts: {
      name: string;
      version: string;
      digest: string;
      scope: string;
      description?: string;
      tags?: string;
      body?: string;
      output: OutputFormat;
    })
    {
      const body = opts.body
        ? JSON.parse(opts.body)
        : {
            name: opts.name,
            version: opts.version,
            digest: opts.digest,
            scope: opts.scope,
            ...(opts.description ? { description: opts.description } : {}),
            ...(opts.tags ? { tags: opts.tags.split(",").map(function _trim(t) { return t.trim(); }) } : {}),
          };

      const client = makeClient(getConfig());
      const { data, error } = await client.POST("/skills/catalog", { body });
      if (error) printApiError("skills create", error);
      print(data, opts.output);
    });

  skills
    .command("update <id>")
    .description("Update a skill bundle (pass --body JSON or individual flags)")
    .option("--name <name>", "New bundle name")
    .option("--version <version>", "New version")
    .option("--digest <digest>", "New digest")
    .option("--scope <scope>", "New scope")
    .option("--status <status>", "New status: draft|published|deprecated")
    .option("--body <json>", "Full JSON payload (overrides individual flags)")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _update(id: string, opts: {
      name?: string;
      version?: string;
      digest?: string;
      scope?: string;
      status?: string;
      body?: string;
      output: OutputFormat;
    })
    {
      const body = opts.body
        ? JSON.parse(opts.body)
        : {
            ...(opts.name ? { name: opts.name } : {}),
            ...(opts.version ? { version: opts.version } : {}),
            ...(opts.digest ? { digest: opts.digest } : {}),
            ...(opts.scope ? { scope: opts.scope } : {}),
            ...(opts.status ? { status: opts.status } : {}),
          };

      const client = makeClient(getConfig());
      const { data, error } = await client.PUT("/skills/catalog/{id}", { params: { path: { id } }, body });
      if (error) printApiError("skills update", error);
      print(data, opts.output);
    });

  skills
    .command("delete <id>")
    .description("Delete a skill bundle and its linked entitlement grants")
    .action(async function _delete(id: string)
    {
      const client = makeClient(getConfig());
      const { error } = await client.DELETE("/skills/catalog/{id}", { params: { path: { id } } });
      if (error) printApiError("skills delete", error);
      printSuccess(`Skill bundle "${id}" deleted`);
    });
}
