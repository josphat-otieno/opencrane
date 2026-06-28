import type { RequestHandler } from "express";

import type { PrismaClient } from "../../generated/prisma/index.js";

/**
 * Creates a health-check handler that verifies fleet registry DB connectivity.
 * @param prisma - The fleet PrismaClient to check.
 * @returns Express handler for the `/healthz` endpoint.
 */
export function _CheckFleetDbHealth(prisma: PrismaClient): RequestHandler
{
  return async function _checkFleetDbHealth(req, res)
  {
    try
    {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", db: true });
    }
    catch
    {
      res.status(503).json({ status: "degraded", db: false });
    }
  };
}
