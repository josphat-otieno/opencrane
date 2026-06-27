import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { _CheckFleetDbHealth } from "../../infra/http/healthz.js";
import type { PrismaClient } from "../../generated/prisma/index.js";

/**
 * Build a minimal Express app mounting the fleet healthz handler over a mocked Prisma client.
 * @param dbHealthy - Whether the mocked registry `$queryRaw` should resolve or reject.
 * @returns An Express app wired for health-check testing.
 */
function _buildHealthApp(dbHealthy: boolean): express.Express
{
  const prisma = {
    $queryRaw: dbHealthy ? vi.fn().mockResolvedValue([{ 1: 1 }]) : vi.fn().mockRejectedValue(new Error("registry down")),
  } as unknown as PrismaClient;
  const app = express();
  app.get("/healthz", _CheckFleetDbHealth(prisma));
  return app;
}

describe("_CheckFleetDbHealth — fleet registry liveness (Stage 3)", function _suite()
{
  it("returns ok when the registry DB is reachable", async function _ok()
  {
    const res = await request(_buildHealthApp(true)).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: true });
  });

  it("returns degraded when the registry DB is unreachable", async function _degraded()
  {
    const res = await request(_buildHealthApp(false)).get("/healthz");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: false });
  });
});
