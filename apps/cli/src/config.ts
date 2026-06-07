import { createControlPlaneClient } from "@opencrane/contracts";

/**
 * Resolved CLI configuration, built from environment variables and global flags.
 */
export interface CliConfig
{
  /** Full base URL including /api/v1 suffix. */
  baseUrl: string;
  /** Bearer token for Authorization header. */
  token: string;
}

/**
 * Build CliConfig from global option values.
 * Priority: explicit flag > environment variable > default.
 *
 * @param opts - Global option object from Commander (url, token).
 */
export function resolveConfig(opts: { url?: string; token?: string }): CliConfig
{
  const rawUrl = opts.url ?? process.env.OPENCRANE_URL ?? "http://localhost:8080";
  const baseUrl = `${rawUrl.replace(/\/+$/, "")}/api/v1`;
  const token = opts.token ?? process.env.OPENCRANE_TOKEN ?? "";

  if (!token)
  {
    console.error("error: authentication token is required. Set OPENCRANE_TOKEN or pass --token <token>");
    process.exit(1);
  }

  return { baseUrl, token };
}

/**
 * Create a typed control-plane client from resolved CLI config.
 *
 * @param config - Resolved CLI configuration.
 */
export function makeClient(config: CliConfig)
{
  return createControlPlaneClient(config.baseUrl, config.token);
}
