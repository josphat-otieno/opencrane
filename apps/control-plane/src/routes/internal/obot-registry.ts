import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

import type { ObotRegistryItem, ObotRegistryResponse, ObotRegistrySourceRow } from "./obot-registry.types.js";

/**
 * Map a persisted MCP server row into the Obot registry wire item.
 *
 * **Custody invariant (P4D.1):** this is the only shape pushed to Obot's
 * catalog sync, and it carries *no* credential/secret material. Downstream
 * credentials are brokered server-side in the gateway plane; they must never
 * traverse this registry path into a tenant-reachable surface.
 *
 * @param server - Minimal MCP server projection (no secret fields).
 * @returns Obot registry item wrapping the endpoint in a `remotes` array.
 */
export function _BuildObotRegistryItem(server: ObotRegistrySourceRow): ObotRegistryItem
{
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    remotes: [{ name: server.name, url: server.endpoint }],
  };
}

/**
 * Internal router that exposes the OpenCrane MCP catalog in Obot's
 * `/v0.1/servers` registry format.
 *
 * Obot polls this endpoint (configured via `OBOT_SERVER_PROVIDER_REGISTRIES`)
 * to sync McpServer rows from the control-plane database into its own catalog.
 *
 * **This router is NOT behind `___AuthMiddleware`.**
 * Access control is enforced at the network layer instead: only the Obot pod
 * can reach this endpoint because the Kubernetes NetworkPolicy for the
 * control-plane allows ingress only from known platform components.
 *
 * @see platform/helm/templates/networkpolicy-planes.yaml — NetworkPolicy
 *   template that governs pod-to-pod reachability for runtime planes.
 *   The control-plane ingress equivalent lives alongside it.
 * @see platform/helm/templates/obot-mcp-gateway-deployment.yaml — where
 *   `OBOT_SERVER_PROVIDER_REGISTRIES` is set to this endpoint's URL.
 *
 * @param prisma - Prisma client for database access.
 */
export function _RegisterObotRegistry(prisma: PrismaClient): Router
{
  const router = Router();

  /**
   * Return all active MCP servers in the Obot registry wire format.
   *
   * Only `Active` servers are included so Obot never surfaces endpoints
   * that are not yet live.  The response is a single page (cursor = null);
   * Obot stops pagination when it sees a null cursor.
   */
  router.get("/v0.1/servers", async function _listObotServers(req, res, next)
  {
    try
    {
      // 1. Fetch only Active servers, ordered by name so the catalog is
      //    deterministic across polls (Obot deduplicates by id, not position).
      const servers = await prisma.mcpServer.findMany({
        where: { status: "Active" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, description: true, endpoint: true, transport: true },
      });

      // 2. Map each database row to the Obot registry item shape, wrapping
      //    the endpoint in a `remotes` array as the spec requires. The mapper
      //    emits no credential material — secrets stay server-side (P4D.1).
      const items: ObotRegistryItem[] = servers.map(function _mapServer(server)
      {
        return _BuildObotRegistryItem(server);
      });

      // 3. Return the paginated envelope; cursor is null because all active
      //    servers fit in a single page.
      const response: ObotRegistryResponse = { items, cursor: null };
      res.json(response);
    }
    catch (err)
    {
      next(err);
    }
  });

  return router;
}
