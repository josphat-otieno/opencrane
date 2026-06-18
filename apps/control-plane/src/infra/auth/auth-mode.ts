import { ___LoadOidcAuthConfig } from "./oidc.config.js";

/**
 * True when the control plane runs with NO real auth configured — neither OIDC nor an
 * `OPENCRANE_API_TOKEN`. This is the dev-mode bypass, mirroring the condition in
 * `auth.middleware` (`!_envToken && !_oidcConfig.enabled`).
 *
 * Scope guards and read-time scope filters use this to decide their fallthrough posture for a
 * request with no established session: **fail OPEN under dev mode** (so a fresh local install or
 * the OPEN dev backend isn't locked out) and **fail CLOSED otherwise** — a missing session in a
 * real auth deployment must never reach a scoped mutation or leak cross-tenant reads (AIR.0b).
 *
 * Reads the environment live (OIDC config is env-derived) so it reflects the current process
 * configuration, including in tests that set the env before issuing a request.
 *
 * @returns True when no real auth is configured (dev-mode bypass active).
 */
export function _IsDevAuthMode(): boolean
{
  const envToken = process.env.OPENCRANE_API_TOKEN?.trim() ?? "";
  return envToken === "" && !___LoadOidcAuthConfig().enabled;
}
