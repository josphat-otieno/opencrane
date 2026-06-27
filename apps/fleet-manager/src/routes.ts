import type { Express } from "express";

import type { PrismaClient } from "./generated/prisma/index.js";
import { _CheckFleetDbHealth } from "./infra/http/healthz.js";

/**
 * Register the fleet-manager HTTP routes on the given Express app.
 *
 * Stage 3 stands up only the infrastructure surface (`/healthz`). The fleet / super-admin routes —
 * ClusterTenant lifecycle, billing, members, Zitadel admin, platform DNS — are relocated here from
 * clustertenant-manager in Stage 4.
 *
 * @param app    - Express application to register routes on.
 * @param prisma - Fleet registry Prisma client used by route handlers.
 * @returns The Express application with routes registered.
 */
export function _RegisterFleetRoutes(app: Express, prisma: PrismaClient): Express
{
  app.get("/healthz", _CheckFleetDbHealth(prisma));
  return app;
}
