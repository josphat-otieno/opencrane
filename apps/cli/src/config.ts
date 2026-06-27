import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { ___CreateControlPlaneClient, ___CreateFleetClient } from "@opencrane/contracts";

/**
 * Resolved CLI configuration built from credentials file, environment
 * variables, and global flags.
 */
export interface CliConfig
{
  /** Full base URL (incl. /api/v1) of the per-silo clustertenant-manager — tenant-facing commands. */
  baseUrl: string;

  /**
   * Full base URL (incl. /api/v1) of the cluster-wide fleet-manager — fleet/super-admin commands
   * (cluster-tenant lifecycle, billing, members, platform DNS, Zitadel admin). Defaults to
   * {@link baseUrl} when no separate fleet URL is configured (co-located / single-host dev).
   */
  fleetBaseUrl: string;

  /**
   * Bearer token for the Authorization header.
   * Null when no credentials are available — `_MakeClient` will reject the
   * call with a helpful message pointing to `oc auth login`.
   */
  token: string | null;
}

/**
 * Shape of the on-disk credentials file at ~/.config/opencrane/credentials.json.
 * Written by `oc auth login` after a successful device authorization grant.
 */
interface _CredentialsFile
{
  /** Plain-text access token issued via the device flow. */
  token: string;
  /** Raw base URL of the silo control-plane instance (no /api/v1 suffix). */
  baseUrl?: string;
  /** Raw base URL of the fleet-manager (no /api/v1 suffix); falls back to baseUrl when unset. */
  fleetBaseUrl?: string;
}

/** Absolute path to the persisted credentials file. */
const _CREDENTIALS_PATH = join(homedir(), ".config", "opencrane", "credentials.json");

/**
 * Read the credentials file from disk.
 * Returns null when the file does not exist or cannot be parsed.
 */
export function _ReadCredentials(): _CredentialsFile | null
{
  if (!existsSync(_CREDENTIALS_PATH))
  {
    return null;
  }

  try
  {
    const raw = readFileSync(_CREDENTIALS_PATH, "utf8");
    return JSON.parse(raw) as _CredentialsFile;
  }
  catch
  {
    return null;
  }
}

/**
 * Build CliConfig from global option values.
 *
 * Token resolution priority:
 *   1. `OPENCRANE_TOKEN` environment variable   — CI / projected ServiceAccount
 *   2. ~/.config/opencrane/credentials.json     — `oc auth login` device flow
 *   3. null                                     — `_MakeClient` will error with guidance
 *
 * URL resolution priority:
 *   1. `--url` flag
 *   2. `OPENCRANE_URL` environment variable
 *   3. `baseUrl` from credentials file
 *   4. http://localhost:8080 default
 *
 * Fleet URL resolution (for fleet/super-admin commands) mirrors the base URL with its own
 * `--fleet-url` flag / `OPENCRANE_FLEET_URL` env / `fleetBaseUrl` credential, and FALLS BACK to
 * the resolved base URL when none is set — so a co-located / single-host install keeps working
 * without extra configuration.
 *
 * @param opts - Global option object from Commander (url + fleetUrl; token flag removed).
 */
export function _ResolveConfig(opts: { url?: string; fleetUrl?: string }): CliConfig
{
  // 1. Read the persisted credentials file — used for both URL and token fallback.
  const creds = _ReadCredentials();

  // 2. Resolve the silo base URL from flag, env, credentials file, or default.
  const rawUrl =
    opts.url
    ?? process.env.OPENCRANE_URL
    ?? creds?.baseUrl
    ?? "http://localhost:8080";
  const baseUrl = `${rawUrl.replace(/\/+$/, "")}/api/v1`;

  // 3. Resolve the fleet-manager URL the same way; fall back to the silo URL when unset.
  const rawFleetUrl =
    opts.fleetUrl
    ?? process.env.OPENCRANE_FLEET_URL
    ?? creds?.fleetBaseUrl;
  const fleetBaseUrl = rawFleetUrl ? `${rawFleetUrl.replace(/\/+$/, "")}/api/v1` : baseUrl;

  // 4. Resolve the token: env var wins (CI path), then credentials file, then null.
  const token =
    (process.env.OPENCRANE_TOKEN?.trim() || null)
    ?? creds?.token
    ?? null;

  return { baseUrl, fleetBaseUrl, token };
}

/**
 * Create a typed control-plane HTTP client from resolved CLI config.
 * Exits with a clear error when no token is available so every command
 * gets the same consistent message without duplicating the check.
 *
 * @param config - Resolved CLI configuration.
 */
export function _MakeClient(config: CliConfig)
{
  // 1. Reject unauthenticated calls before constructing the client.
  if (!config.token)
  {
    console.error("error: not authenticated. Run `oc auth login` to sign in.");
    process.exit(1);
  }

  // 2. Build and return the typed client with the bearer token attached.
  return ___CreateControlPlaneClient(config.baseUrl, config.token);
}

/**
 * Create a typed client for the FLEET-MANAGER from resolved CLI config — used by the
 * fleet/super-admin commands (cluster-tenant lifecycle, billing, members, platform DNS, Zitadel
 * admin), which moved off the per-silo control-plane to the cluster-wide fleet plane (Stage 4).
 * Identical auth handling to {@link _MakeClient}; only the base URL differs (and falls back to
 * the silo URL when no separate fleet URL is configured).
 *
 * @param config - Resolved CLI configuration.
 */
export function _MakeFleetClient(config: CliConfig)
{
  if (!config.token)
  {
    console.error("error: not authenticated. Run `oc auth login` to sign in.");
    process.exit(1);
  }
  return ___CreateFleetClient(config.fleetBaseUrl, config.token);
}
