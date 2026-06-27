import createFetchClient from "openapi-fetch";

import type { paths } from "./generated/api.js";
import type { paths as fleetPaths } from "./generated/fleet-api.js";

/**
 * Re-export the typed path maps so consumers can type-check their own fetch calls.
 * `paths` = the per-silo clustertenant-manager API; `fleetPaths` = the cluster-wide
 * fleet-manager API (ClusterTenant lifecycle, billing, members, platform DNS, Zitadel admin).
 */
export type { paths };
export type { fleetPaths };

/**
 * Create a typed HTTP client for the per-silo clustertenant-manager (control-plane) API.
 *
 * Usage:
 *   import { ___CreateControlPlaneClient } from "@opencrane/contracts";
 *   const client = ___CreateControlPlaneClient("http://localhost:8080/api/v1", token);
 *   const { data, error } = await client.GET("/tenants");
 *
 * @param baseUrl - Full base URL including the /api/v1 prefix.
 * @param token   - Bearer token for Authorization header. If omitted the header is not sent.
 */
export function ___CreateControlPlaneClient(baseUrl: string, token?: string)
{
  // 1. Seed the default headers with the content-type all API endpoints expect.
  const headers: Record<string, string> = { "content-type": "application/json" };

  // 2. Attach the bearer token when one is available; omit the header for public endpoints.
  if (token)
  {
    headers.authorization = `Bearer ${token}`;
  }

  // 3. Return a fully-typed fetch client bound to the versioned base URL.
  return createFetchClient<paths>({ baseUrl, headers });
}

/** Type alias for the client returned by `___CreateControlPlaneClient`. */
export type ControlPlaneClient = ReturnType<typeof ___CreateControlPlaneClient>;

/**
 * Create a typed HTTP client for the cluster-wide fleet-manager API (the fleet / super-admin
 * surface: ClusterTenant lifecycle, billing, org membership, platform DNS, Zitadel admin).
 * Same auth handling as {@link ___CreateControlPlaneClient}; typed against the fleet path map.
 *
 * @param baseUrl - Full fleet base URL including the /api/v1 prefix.
 * @param token   - Bearer token for Authorization header. If omitted the header is not sent.
 */
export function ___CreateFleetClient(baseUrl: string, token?: string)
{
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token)
  {
    headers.authorization = `Bearer ${token}`;
  }
  return createFetchClient<fleetPaths>({ baseUrl, headers });
}

/** Type alias for the client returned by `___CreateFleetClient`. */
export type FleetClient = ReturnType<typeof ___CreateFleetClient>;
