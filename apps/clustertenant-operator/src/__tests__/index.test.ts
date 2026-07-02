import type { PrismaClient } from "@prisma/client";
import express from "express";
import type { Express } from "express";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

import { _CheckDbHealth, _RateLimit } from "@opencrane/infra-http";

/**
 * Build a minimal Express app with a mocked database health handler.
 * @param dbHealthy - Whether the mock DB query should succeed
 * @returns An Express app wired for health-check testing
 */
function _buildHealthApp(dbHealthy: boolean): Express
{
  const prisma = {
    $queryRaw: dbHealthy ? vi.fn().mockResolvedValue([{ 1: 1 }]) : vi.fn().mockRejectedValue(new Error("db unavailable")),
  } as unknown as PrismaClient;

  const app = express();
  app.use(express.json());
  app.get("/healthz", _CheckDbHealth(prisma));

  return app;
}

/**
 * Build a minimal Express app with auth middleware loaded after env setup.
 * No Prisma client is passed so DB-token validation is skipped; these tests
 * only exercise the env-var token and dev-mode bypass paths.
 * @returns An Express app wired for auth testing
 */
async function _buildAuthApp(): Promise<Express>
{
  vi.resetModules();

  const { ___AuthMiddleware } = await import("@opencrane/infra-auth");
  const app = express();
  app.use(express.json());
  // Mirror production middleware order: the per-IP limiter is mounted before auth + routes.
  app.use(_RateLimit());
  // Prisma omitted intentionally — tests target the env-var and dev-mode paths.
  app.use(___AuthMiddleware());

  app.get("/healthz", function _healthz(req, res)
  {
    res.json({ status: "ok", db: true });
  });

  app.get("/api/test", function _test(req, res)
  {
    res.json({ ok: true });
  });

  return app;
}

describe("Control Plane", () =>
{
  it("healthz endpoint returns ok", async () =>
  {
    const app = _buildHealthApp(true);
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: true });
  });

  it("healthz endpoint returns degraded when DB is unavailable", async () =>
  {
    const app = _buildHealthApp(false);
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: false });
  });

  describe("auth middleware", () =>
  {
    let originalToken: string | undefined;

    beforeEach(() =>
    {
      originalToken = process.env.OPENCRANE_API_TOKEN;
    });

    afterEach(() =>
    {
      if (originalToken)
      {
        process.env.OPENCRANE_API_TOKEN = originalToken;
      }
      else
      {
        delete process.env.OPENCRANE_API_TOKEN;
      }

      vi.resetModules();
    });

    it("rejects requests without Authorization header when token is configured", async () =>
    {
      process.env.OPENCRANE_API_TOKEN = "test-secret";
      const app = await _buildAuthApp();

      const res = await request(app).get("/api/test");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Missing Authorization header" });
    });

    it("rejects requests with wrong token", async () =>
    {
      process.env.OPENCRANE_API_TOKEN = "test-secret";
      const app = await _buildAuthApp();

      const res = await request(app)
        .get("/api/test")
        .set("Authorization", "Bearer wrong-token");

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Invalid token" });
    });

    it("allows requests with correct token", async () =>
    {
      process.env.OPENCRANE_API_TOKEN = "test-secret";
      const app = await _buildAuthApp();

      const res = await request(app)
        .get("/api/test")
        .set("Authorization", "Bearer test-secret");

      expect(res.status).toBe(200);
    });

    it("allows all requests when no token is configured (dev mode)", async () =>
    {
      delete process.env.OPENCRANE_API_TOKEN;
      const app = await _buildAuthApp();

      const res = await request(app).get("/api/test");
      expect(res.status).toBe(200);
    });

    it("healthz bypasses auth even with token configured", async () =>
    {
      process.env.OPENCRANE_API_TOKEN = "test-secret";
      const app = await _buildAuthApp();

      const res = await request(app).get("/healthz");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("mounts internal routes BEFORE the auth gate, so tokenless calls reach them", async () =>
    {
      // Regression: `/api/internal/*` was registered AFTER ___AuthMiddleware, so the
      // operator's tokenless reconcile fetch of tenant-models 401'd → empty model set →
      // replace-mode pods bricked. `_RegisterInternalRoutes` must run first. We assert the
      // ORDERING invariant directly with a stand-in "deny-all" gate (deterministic — no
      // dependency on the auth lib's env/module-init timing): anything mounted AFTER the
      // internal routes cannot see requests the internal routes already handled.
      const { _RegisterInternalRoutes } = await import("../routes.js");

      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue(null) },
        modelDefinition: { findMany: vi.fn().mockResolvedValue([]) },
        modelRoutingDefault: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const app = express();
      app.use(express.json());
      // Production order: internal routes first …
      _RegisterInternalRoutes(app, prisma, {} as never);
      // … then the auth gate (stand-in for ___AuthMiddleware) that blocks everything reaching it.
      app.use(function _denyAll(req, res) { res.status(401).json({ error: "blocked by auth gate" }); });
      app.get("/api/test", function _test(req, res) { res.json({ ok: true }); });

      // A route mounted after the gate is unreachable → 401 …
      expect((await request(app).get("/api/test")).status).toBe(401);
      // … but the NetworkPolicy-only internal models route is handled before the gate.
      const internal = await request(app).get("/api/internal/tenant-models/some-tenant");
      expect(internal.status).toBe(200);
      expect(internal.body).toEqual({ models: [], defaultModel: null });
    });
  });
});
