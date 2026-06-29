import type { OpenClawPairing } from "./openclaw-pairing.types.js";

/** Shape we read out of `Tenant.configOverrides.openclaw`. */
interface _StoredPairing
{
  gatewayUrl?: unknown;
}

/**
 * Resolve a tenant pod's OpenClaw connection coordinates (the gateway URL).
 *
 * A `wss://` gateway URL stored under `configOverrides.openclaw` takes precedence;
 * otherwise the URL falls back to `wss://<ingressHost>` when only the ingress host
 * is known. Returns null when no gateway URL can be determined — the pod is not yet
 * reachable. Trusted-proxy gateway auth (CONN.4) needs no token, so none is read.
 *
 * @param configOverrides - The tenant's `configOverrides` JSON column (unknown shape).
 * @param ingressHost     - The tenant pod's ingress host, if assigned.
 */
export function _ResolveOpenClawPairing(configOverrides: unknown, ingressHost: string | null): OpenClawPairing | null
{
  const stored = _ReadStoredPairing(configOverrides);

  // Only ever hand the browser an encrypted `wss://` endpoint. A stored `ws://`
  // (or any non-wss) URL is rejected and we fall back to the `wss://<ingressHost>`
  // form — never downgrade the transport, even if the column is misconfigured.
  const storedUrl = typeof stored?.gatewayUrl === "string" ? stored.gatewayUrl : "";
  const gatewayUrl = storedUrl.startsWith("wss://")
    ? storedUrl
    : ingressHost
      ? `wss://${ingressHost}`
      : null;

  if (!gatewayUrl)
  {
    return null;
  }

  return { gatewayUrl };
}

/**
 * Safely extract the `openclaw` block from the `configOverrides` JSON.
 *
 * @param configOverrides - The tenant's `configOverrides` column (unknown shape).
 * @returns The stored pairing block, or null when missing/malformed.
 */
function _ReadStoredPairing(configOverrides: unknown): _StoredPairing | null
{
  if (typeof configOverrides !== "object" || configOverrides === null)
  {
    return null;
  }
  const openclaw = (configOverrides as { openclaw?: unknown }).openclaw;
  if (typeof openclaw !== "object" || openclaw === null)
  {
    return null;
  }
  return openclaw as _StoredPairing;
}
