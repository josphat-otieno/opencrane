import type * as k8s from "@kubernetes/client-node";
import express from "express";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { tenantsRouter } from "../../routes/tenants.js";

/** Build an Express app containing only the tenants router. */
function _buildTenantsApp(customApi: k8s.CustomObjectsApi, prisma: PrismaClient): Express
{
  const app = express();
  app.use(express.json());
  app.use("/api/tenants", tenantsRouter(customApi, prisma));
  return app;
}

/** Build a minimal Prisma stub for tenant route tests. */
function _buildPrismaStub(): PrismaClient
{
  return {
    tenant: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditEntry: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

describe("tenantsRouter dataset membership endpoints", () =>
{
  it("returns dataset memberships parsed from tenant annotations", async () =>
  {
    const customApi = {
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: {
          annotations: {
            "opencrane.io/datasets-org": "default,global",
            "opencrane.io/datasets-team": "engineering",
            "opencrane.io/datasets-project": "apollo",
            "opencrane.io/datasets-personal": "owner@example.com",
          },
        },
      }),
    } as unknown as k8s.CustomObjectsApi;

    const app = _buildTenantsApp(customApi, _buildPrismaStub());
    const response = await request(app).get("/api/tenants/acme/datasets");

    expect(response.status).toBe(200);
    expect(response.body.org).toEqual(["default", "global"]);
    expect(response.body.team).toEqual(["engineering"]);
    expect(response.body.project).toEqual(["apollo"]);
    expect(response.body.personal).toEqual(["owner@example.com"]);
  });

  it("updates tenant dataset memberships and writes an audit entry", async () =>
  {
    const getSpy = vi.fn().mockResolvedValue({
      metadata: { annotations: { "opencrane.io/existing": "value" } },
    });
    const patchSpy = vi.fn().mockResolvedValue({});
    const auditCreateSpy = vi.fn().mockResolvedValue({});

    const customApi = {
      getNamespacedCustomObject: getSpy,
      patchNamespacedCustomObject: patchSpy,
    } as unknown as k8s.CustomObjectsApi;

    const prisma = {
      auditEntry: { create: auditCreateSpy },
    } as unknown as PrismaClient;

    const app = _buildTenantsApp(customApi, prisma);
    const response = await request(app)
      .put("/api/tenants/acme/datasets")
      .send({
        org: ["default"],
        team: ["engineering"],
        project: ["apollo"],
        personal: ["owner@example.com"],
      });

    expect(response.status).toBe(200);
    expect(patchSpy).toHaveBeenCalledOnce();
    expect(auditCreateSpy).toHaveBeenCalledOnce();
    expect(response.body.team).toEqual(["engineering"]);
  });

  it("returns 404 when updating datasets for a missing tenant", async () =>
  {
    const customApi = {
      getNamespacedCustomObject: vi.fn().mockRejectedValue({ statusCode: 404 }),
      patchNamespacedCustomObject: vi.fn(),
    } as unknown as k8s.CustomObjectsApi;

    const app = _buildTenantsApp(customApi, _buildPrismaStub());
    const response = await request(app)
      .put("/api/tenants/missing/datasets")
      .send({
        org: ["default"],
        team: [],
        project: [],
        personal: [],
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Tenant not found");
  });

  it("returns 400 when dataset update payload is invalid", async () =>
  {
    const customApi = {
      getNamespacedCustomObject: vi.fn(),
      patchNamespacedCustomObject: vi.fn(),
    } as unknown as k8s.CustomObjectsApi;

    const app = _buildTenantsApp(customApi, _buildPrismaStub());
    const response = await request(app)
      .put("/api/tenants/acme/datasets")
      .send({
        org: "default",
        team: [],
        project: [],
        personal: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("org, team, project, and personal must all be string arrays");
  });

  it("returns 502 when persisting dataset updates fails", async () =>
  {
    const customApi = {
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { annotations: {} },
      }),
      patchNamespacedCustomObject: vi.fn().mockRejectedValue(new Error("patch failed")),
    } as unknown as k8s.CustomObjectsApi;

    const app = _buildTenantsApp(customApi, _buildPrismaStub());
    const response = await request(app)
      .put("/api/tenants/acme/datasets")
      .send({
        org: ["default"],
        team: [],
        project: [],
        personal: [],
      });

    expect(response.status).toBe(502);
    expect(response.body.error).toBe("Failed to persist tenant datasets");
  });

  it("returns 200 when audit write fails after dataset patch succeeds", async () =>
  {
    const customApi = {
      getNamespacedCustomObject: vi.fn().mockResolvedValue({
        metadata: { annotations: {} },
      }),
      patchNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    } as unknown as k8s.CustomObjectsApi;
    const prisma = {
      auditEntry: { create: vi.fn().mockRejectedValue(new Error("audit unavailable")) },
    } as unknown as PrismaClient;

    const app = _buildTenantsApp(customApi, prisma);
    const response = await request(app)
      .put("/api/tenants/acme/datasets")
      .send({
        org: ["default"],
        team: [],
        project: [],
        personal: [],
      });

    expect(response.status).toBe(200);
    expect(response.body.org).toEqual(["default"]);
  });

  it("returns 502 when loading datasets fails for a non-not-found error", async () =>
  {
    const customApi = {
      getNamespacedCustomObject: vi.fn().mockRejectedValue({ statusCode: 500 }),
    } as unknown as k8s.CustomObjectsApi;

    const app = _buildTenantsApp(customApi, _buildPrismaStub());
    const response = await request(app).get("/api/tenants/acme/datasets");

    expect(response.status).toBe(502);
    expect(response.body.error).toBe("Failed to load tenant datasets");
  });
});

describe("tenantsRouter create endpoint — Tenant CR appearance validation", () =>
{
  it("creates a tenant when the Tenant CR appears", async () =>
  {
    const customApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({}),
      getNamespacedCustomObject: vi.fn().mockResolvedValue({}),
    } as unknown as k8s.CustomObjectsApi;
    const tenantCreateSpy = vi.fn().mockResolvedValue({});
    const auditCreateSpy = vi.fn().mockResolvedValue({});
    const prisma = {
      tenant: { create: tenantCreateSpy },
      auditEntry: { create: auditCreateSpy },
    } as unknown as PrismaClient;

    const app = _buildTenantsApp(customApi, prisma);
    const response = await request(app)
      .post("/api/tenants")
      .send({
        name: "acme",
        displayName: "Acme",
        email: "owner@acme.io",
      });

    expect(response.status).toBe(201);
    expect(tenantCreateSpy).toHaveBeenCalledOnce();
    expect(auditCreateSpy).toHaveBeenCalledOnce();
  });

  it("returns 504 when the Tenant CR does not appear within the SLO window", async () =>
  {
    process.env.TENANT_CR_APPEARANCE_TIMEOUT_MS = "5";
    process.env.TENANT_CR_APPEARANCE_POLL_INTERVAL_MS = "1";
    const customApi = {
      createNamespacedCustomObject: vi.fn().mockResolvedValue({}),
      getNamespacedCustomObject: vi.fn().mockRejectedValue({ statusCode: 404 }),
    } as unknown as k8s.CustomObjectsApi;
    const tenantCreateSpy = vi.fn().mockResolvedValue({});
    const auditCreateSpy = vi.fn().mockResolvedValue({});
    const prisma = {
      tenant: { create: tenantCreateSpy },
      auditEntry: { create: auditCreateSpy },
    } as unknown as PrismaClient;

    const app = _buildTenantsApp(customApi, prisma);
    const response = await request(app)
      .post("/api/tenants")
      .send({
        name: "slow-tenant",
        displayName: "Slow Tenant",
        email: "owner@acme.io",
      });

    delete process.env.TENANT_CR_APPEARANCE_TIMEOUT_MS;
    delete process.env.TENANT_CR_APPEARANCE_POLL_INTERVAL_MS;

    expect(response.status).toBe(504);
    expect(response.body.error).toContain("within 30 seconds");
    expect(tenantCreateSpy).not.toHaveBeenCalled();
    expect(auditCreateSpy).not.toHaveBeenCalled();
  });
});
