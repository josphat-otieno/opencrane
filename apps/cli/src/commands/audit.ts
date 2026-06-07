import type { Command } from "commander";

import type { CliConfig } from "../config.js";
import { makeClient } from "../config.js";
import { print, printApiError, type OutputFormat } from "../format.js";

/** Register all `oc audit *` sub-commands on the given parent Command. */
export function registerAudit(parent: Command, getConfig: () => CliConfig): void
{
  const audit = parent
    .command("audit")
    .description("Query the audit log with optional tenant filter and cursor pagination");

  audit
    .command("list")
    .description("List audit log entries")
    .option("--tenant <name>", "Filter to a specific tenant")
    .option("--limit <n>", "Maximum entries to return (default 100)", "100")
    .option("--cursor <cursor>", "Pagination cursor from a previous response")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _list(opts: {
      tenant?: string;
      limit: string;
      cursor?: string;
      output: OutputFormat;
    })
    {
      const client = makeClient(getConfig());
      const { data, error } = await client.GET("/audit", {
        params: {
          query: {
            ...(opts.tenant ? { tenant: opts.tenant } : {}),
            limit: Number(opts.limit),
            ...(opts.cursor ? { cursor: opts.cursor } : {}),
          },
        },
      });
      if (error) printApiError("audit list", error);

      if (opts.output === "json")
      {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const response = data as { data?: unknown[]; pagination?: { hasMore?: boolean; nextCursor?: string } } | undefined;
      print(response?.data, opts.output, ["timestamp", "tenant", "action", "resource", "message"]);

      if (response?.pagination?.hasMore)
      {
        console.log(`\nMore results available. Next cursor: ${response.pagination.nextCursor ?? "(none)"}`);
        console.log(`Run with --cursor ${response.pagination.nextCursor ?? ""} to fetch the next page.`);
      }
    });
}
