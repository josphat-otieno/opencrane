import { readFileSync } from "fs";

import type { Command } from "commander";

import type { CliConfig } from "../config.js";
import { _MakeClient } from "../config.js";
import { _Print, _PrintApiError, _PrintSuccess, type OutputFormat } from "../format.js";

/** Options accepted by `oc platform dns set`. */
interface _DnsSetOptions
{
  /** DNS-01 solver provider key. */
  provider: string;
  /** Base/delegated DNS zone the wildcard cert covers. */
  zone: string;
  /** ACME account contact email. */
  email: string;
  /** Optional ACME directory URL override. */
  server?: string;
  /** Optional ClusterIssuer name. */
  issuerName?: string;
  /** Path to a file holding the provider API token (never passed on the CLI). */
  tokenFile?: string;
  /** Path to a JSON file holding a raw provider solver block. */
  solverConfigFile?: string;
}

/** Register all `oc platform *` sub-commands on the given parent Command. */
export function _RegisterPlatform(parent: Command, getConfig: () => CliConfig): void
{
  const platform = parent
    .command("platform")
    .description("Platform-admin operations (TLS/DNS issuance)");

  const dns = platform
    .command("dns")
    .description("Manage the wildcard-TLS DNS-01 issuer (set, show)");

  dns
    .command("show")
    .description("Show the configured platform DNS-01 ClusterIssuer")
    .option("--issuer-name <name>", "ClusterIssuer name to inspect")
    .option("-o, --output <format>", "Output format: table|json", "table")
    .action(async function _show(opts: { issuerName?: string; output: OutputFormat })
    {
      const client = _MakeClient(getConfig());
      const { data, error } = await client.GET("/platform/dns", {
        params: { query: opts.issuerName ? { issuerName: opts.issuerName } : {} },
      });
      if (error) _PrintApiError("platform dns show", error);
      _Print(data, opts.output, ["configured", "issuerName", "provider", "email", "server"]);
    });

  dns
    .command("set")
    .description("Configure the DNS-01 ClusterIssuer that issues the wildcard tenant cert")
    .requiredOption("--provider <provider>", "Solver provider (cloudflare | digitalocean | route53 | rfc2136 | …)")
    .requiredOption("--zone <zone>", "Base/delegated DNS zone (e.g. ai.elewa.ke)")
    .requiredOption("--email <email>", "ACME account contact email")
    .option("--server <url>", "ACME directory URL (defaults to Let's Encrypt production)")
    .option("--issuer-name <name>", "ClusterIssuer name (defaults to opencrane-issuer)")
    .option("--token-file <path>", "File containing the provider API token (token-based providers)")
    .option("--solver-config-file <path>", "JSON file with a raw provider solver block (route53/rfc2136)")
    .action(async function _set(opts: _DnsSetOptions)
    {
      // 1. Read the token/solver-config from files so secrets never appear in
      //    shell history or process args.
      const apiToken = opts.tokenFile ? readFileSync(opts.tokenFile, "utf8").trim() : undefined;
      const solverConfig = opts.solverConfigFile ? JSON.parse(readFileSync(opts.solverConfigFile, "utf8")) : undefined;

      // 2. Apply the config via the control-plane onboarding endpoint.
      const client = _MakeClient(getConfig());
      const { data, error } = await client.PUT("/platform/dns", {
        body: {
          provider: opts.provider,
          zone: opts.zone,
          email: opts.email,
          server: opts.server,
          issuerName: opts.issuerName,
          apiToken,
          solverConfig,
        },
      });
      if (error) _PrintApiError("platform dns set", error);
      _PrintSuccess(`DNS issuer configured for zone "${opts.zone}" via ${opts.provider}`);
      _Print(data, "json");
    });
}
