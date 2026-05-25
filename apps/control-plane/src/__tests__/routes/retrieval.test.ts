import type * as k8s from "@kubernetes/client-node";
import express from "express";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { retrievalRouter } from "../../routes/retrieval.js";

/** Build a minimal Express app wrapping only the retrieval router. */
function _buildRetrievalApp(customApi: k8s.CustomObjectsApi, prisma: PrismaClient): Express
{
  const app = express();
  app.use(express.json());
  app.use("/api/retrieval", retrievalRouter(customApi, prisma));
  return app;
}

/** Minimal Prisma stub with all methods used by the retrieval route. */
function _buildPrismaStub(overrides: Partial<{
  tenant: unknown;
  orgDocuments: unknown[];
  auditEntryCreate: unknown;
}> = {}): PrismaClient
{
  const tenantValue = "tenant" in overrides ? overrides.tenant : { name: "acme", phase: "Running" };

  return {
    tenant: {
      findUnique: vi.fn().mockResolvedValue(tenantValue),
    },
    orgDocument: {
      findMany: vi.fn().mockResolvedValue(overrides.orgDocuments ?? []),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    auditEntry: {
      create: vi.fn().mockResolvedValue(overrides.auditEntryCreate ?? {}),
    },
  } as unknown as PrismaClient;
}

/** Minimal customApi stub — returns the desired CRD response or throws. */
function _buildCustomApiStub(tenantSpec: unknown, policySpec: unknown): k8s.CustomObjectsApi
{
  return {
    getNamespacedCustomObject: vi.fn().mockImplementation(
      function _mockGet({ plural }: { plural: string })
      {
        if (plural === "tenants")
        {
          return Promise.resolve(tenantSpec);
        }

        if (plural === "accesspolicies")
        {
          return Promise.resolve(policySpec);
        }

        return Promise.reject(new Error("unknown plural"));
      },
    ),
  } as unknown as k8s.CustomObjectsApi;
}

describe("retrievalRouter — conformance tests", () =>
{
  describe("POST /api/retrieval/query — validation", () =>
  {
    it("returns 400 when query is missing", async () =>
    {
      const prisma = _buildPrismaStub();
      const customApi = _buildCustomApiStub({}, {});
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ tenantName: "acme" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("UNAUTHORIZED");
    });

    it("returns 400 when tenantName is missing", async () =>
    {
      const prisma = _buildPrismaStub();
      const customApi = _buildCustomApiStub({}, {});
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "team meeting notes" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("UNAUTHORIZED");
    });

    it("returns 404 when the tenant does not exist", async () =>
    {
      const prisma = _buildPrismaStub({ tenant: null });
      const customApi = _buildCustomApiStub({}, {});
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "notes", tenantName: "unknown-tenant", datasetScope: "org", datasetId: "default" });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("TENANT_NOT_FOUND");
    });

    it("returns 400 when datasetScope is invalid", async () =>
    {
      const prisma = _buildPrismaStub();
      const customApi = _buildCustomApiStub({}, {});
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "notes", tenantName: "acme", datasetScope: "invalid-scope" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("UNAUTHORIZED");
    });

    it("returns 400 when datasetId is missing", async () =>
    {
      const prisma = _buildPrismaStub();
      const customApi = _buildCustomApiStub({}, {});
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "notes", tenantName: "acme", datasetScope: "team" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("UNAUTHORIZED");
    });

    it("returns 400 when datasetId is not a string", async () =>
    {
      const prisma = _buildPrismaStub();
      const customApi = _buildCustomApiStub({}, {});
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "notes", tenantName: "acme", datasetScope: "team", datasetId: 42 });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("UNAUTHORIZED");
    });

    it("defaults dataset scope/id to org/default for backward-compatible clients", async () =>
    {
      const prisma = _buildPrismaStub();
      const customApi = _buildCustomApiStub(
        { spec: { policyRef: null }, metadata: { annotations: { "opencrane.io/datasets-org": "default" } } },
        {},
      );
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "notes", tenantName: "acme" });

      expect(response.status).toBe(200);
      expect(response.body.datasetScope).toBe("org");
      expect(response.body.datasetId).toBe("default");
    });

    it("returns 503 when tenant dataset membership cannot be resolved", async () =>
    {
      const auditCreateSpy = vi.fn().mockResolvedValue({});
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ name: "acme", phase: "Running" }) },
        orgDocument: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
        auditEntry: { create: auditCreateSpy },
      } as unknown as PrismaClient;
      const customApi = {
        getNamespacedCustomObject: vi.fn()
          .mockResolvedValueOnce({ spec: { policyRef: null } })
          .mockRejectedValueOnce(new Error("k8s unavailable")),
      } as unknown as k8s.CustomObjectsApi;
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "notes", tenantName: "acme", datasetScope: "org", datasetId: "default" });

      expect(response.status).toBe(503);
      expect(response.body.code).toBe("INTERNAL_ERROR");
      expect(auditCreateSpy).toHaveBeenCalledOnce();
      const auditCall = auditCreateSpy.mock.calls[0][0];
      expect(auditCall.data.action).toBe("RetrievalDenied");
      expect(auditCall.data.metadata.deniedBy).toBe("dataset-membership-unavailable");
    });
  });

  describe("POST /api/retrieval/query — allow path", () =>
  {
    it("returns 200 with results when no policy restricts retrieval", async () =>
    {
      const mockDocs = [
        {
          id: "doc-1",
          source: "slack",
          sourceId: "C123/1716900000.000000",
          owner: "engineering",
          teamScope: "engineering",
          sensitivityTags: ["org:default"],
          title: "Team standup notes",
          content: "Today we discussed the deployment pipeline and upcoming sprint goals.",
          contentHash: "abc123",
          embeddingReady: false,
          ingestedAt: new Date("2024-01-15T10:00:00Z"),
          updatedAt: new Date("2024-01-15T10:00:00Z"),
        },
      ];

      const prisma = _buildPrismaStub({ orgDocuments: mockDocs });
      // No policy configured on the tenant — retrieval is allowed by default.
      const customApi = _buildCustomApiStub({ spec: { policyRef: null } }, {});
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "deployment pipeline", tenantName: "acme", datasetScope: "org", datasetId: "default" });

      expect(response.status).toBe(200);
      expect(response.body.authOutcome).toBe("allowed");
      expect(response.body.results).toHaveLength(1);
      expect(response.body.datasetScope).toBe("org");
      expect(response.body.datasetId).toBe("default");
      expect(response.body.results[0].source).toBe("slack");
      expect(response.body.results[0].contentExcerpt).toBeTruthy();
    });

    it("returns 200 when policy explicitly allows retrieval in MCP allow list", async () =>
    {
      const mockDocs = [
        {
          id: "doc-2",
          source: "confluence",
          sourceId: "CONF-456",
          owner: "product",
          teamScope: null,
          sensitivityTags: ["internal", "org:default"],
          title: null,
          content: "Q1 product roadmap: feature X, feature Y.",
          contentHash: null,
          embeddingReady: false,
          ingestedAt: new Date("2024-02-01T09:00:00Z"),
          updatedAt: new Date("2024-02-01T09:00:00Z"),
        },
      ];

      const prisma = _buildPrismaStub({ orgDocuments: mockDocs });
      const customApi = _buildCustomApiStub(
        { spec: { policyRef: "engineering-policy" } },
        { spec: { mcpServers: { allow: ["retrieval", "skills"] } } },
      );
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "roadmap", tenantName: "acme", datasetScope: "org", datasetId: "default" });

      expect(response.status).toBe(200);
      expect(response.body.authOutcome).toBe("allowed");
      expect(response.body.count).toBe(1);
    });

    it("returns 200 for an allowed team dataset membership", async () =>
    {
      const mockDocs = [
        {
          id: "doc-2b",
          source: "slack",
          sourceId: "C456/1716900000.000000",
          owner: "engineering",
          teamScope: "engineering",
          sensitivityTags: [],
          title: "Platform updates",
          content: "Team-only rollout notes.",
          contentHash: "def456",
          embeddingReady: false,
          ingestedAt: new Date("2024-02-02T09:00:00Z"),
          updatedAt: new Date("2024-02-02T09:00:00Z"),
        },
      ];

      const prisma = _buildPrismaStub({ orgDocuments: mockDocs });
      const customApi = _buildCustomApiStub(
        {
          spec: { policyRef: null },
          metadata: { annotations: { "opencrane.io/datasets-team": "engineering" } },
        },
        {},
      );
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "rollout", tenantName: "acme", datasetScope: "team", datasetId: "engineering" });

      expect(response.status).toBe(200);
      expect(response.body.datasetScope).toBe("team");
      expect(response.body.datasetId).toBe("engineering");
      expect(response.body.count).toBe(1);
    });

    it("returns 200 for an allowed personal dataset membership", async () =>
    {
      const mockDocs = [
        {
          id: "doc-2c",
          source: "slack",
          sourceId: "D789/1716900000.000000",
          owner: "owner@example.com",
          teamScope: null,
          sensitivityTags: [],
          title: "Personal notes",
          content: "Private recap.",
          contentHash: "ghi789",
          embeddingReady: false,
          ingestedAt: new Date("2024-02-03T09:00:00Z"),
          updatedAt: new Date("2024-02-03T09:00:00Z"),
        },
      ];

      const prisma = _buildPrismaStub({ orgDocuments: mockDocs });
      const customApi = _buildCustomApiStub(
        {
          spec: { policyRef: null },
          metadata: { annotations: { "opencrane.io/datasets-personal": "owner@example.com" } },
        },
        {},
      );
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "recap", tenantName: "acme", datasetScope: "personal", datasetId: "owner@example.com" });

      expect(response.status).toBe(200);
      expect(response.body.datasetScope).toBe("personal");
      expect(response.body.count).toBe(1);
    });

    it("applies org dataset tag filtering for org/default requests", async () =>
    {
      const findManySpy = vi.fn().mockResolvedValue([]);
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ name: "acme", phase: "Running" }) },
        orgDocument: { findMany: findManySpy, count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
        auditEntry: { create: vi.fn().mockResolvedValue({}) },
      } as unknown as PrismaClient;
      const customApi = _buildCustomApiStub(
        {
          spec: { policyRef: null },
          metadata: { annotations: { "opencrane.io/datasets-org": "default" } },
        },
        {},
      );
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "notes", tenantName: "acme", datasetScope: "org", datasetId: "default" });

      expect(response.status).toBe(200);
      const whereClause = findManySpy.mock.calls[0][0].where;
      expect(whereClause.AND).toContainEqual({
        OR: [
          { sensitivityTags: { has: "org:default" } },
          {
            AND: [
              { sensitivityTags: { isEmpty: true } },
              { teamScope: null },
            ],
          },
        ],
      });
    });
  });

  describe("POST /api/retrieval/query — deny path", () =>
  {
    it("returns 403 when policy explicitly denies retrieval via deny list", async () =>
    {
      const prisma = _buildPrismaStub();
      const customApi = _buildCustomApiStub(
        { spec: { policyRef: "restricted-policy" } },
        { spec: { mcpServers: { deny: ["retrieval"] } } },
      );
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "company secrets", tenantName: "acme", datasetScope: "org", datasetId: "default" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("POLICY_DENIED");
      expect(response.body.error).toContain("restricted-policy");
    });

    it("returns 403 when policy has allow list that excludes retrieval", async () =>
    {
      const prisma = _buildPrismaStub();
      const customApi = _buildCustomApiStub(
        { spec: { policyRef: "skills-only-policy" } },
        { spec: { mcpServers: { allow: ["skills"] } } },
      );
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "any query", tenantName: "acme", datasetScope: "org", datasetId: "default" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("POLICY_DENIED");
    });

    it("returns 403 when tenant is not a member of requested dataset", async () =>
    {
      const auditCreateSpy = vi.fn().mockResolvedValue({});
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ name: "acme", phase: "Running" }) },
        orgDocument: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
        auditEntry: { create: auditCreateSpy },
      } as unknown as PrismaClient;
      const customApi = _buildCustomApiStub(
        {
          spec: { policyRef: null },
          metadata: { annotations: { "opencrane.io/datasets-team": "sales" } },
        },
        {},
      );
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "notes", tenantName: "acme", datasetScope: "team", datasetId: "engineering" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("DATASET_DENIED");
      expect(auditCreateSpy).toHaveBeenCalledOnce();
      const auditCall = auditCreateSpy.mock.calls[0][0];
      expect(auditCall.data.action).toBe("RetrievalDenied");
      expect(auditCall.data.metadata.deniedBy).toBe("dataset");
    });

    it("returns 403 when tenant is not a member of requested project dataset", async () =>
    {
      const prisma = _buildPrismaStub();
      const customApi = _buildCustomApiStub(
        {
          spec: { policyRef: null },
          metadata: { annotations: { "opencrane.io/datasets-project": "apollo" } },
        },
        {},
      );
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "notes", tenantName: "acme", datasetScope: "project", datasetId: "zeus" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("DATASET_DENIED");
    });

    it("creates an audit entry with action RetrievalDenied when access is denied", async () =>
    {
      const auditCreateSpy = vi.fn().mockResolvedValue({});
      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue({ name: "acme", phase: "Running" }) },
        orgDocument: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
        auditEntry: { create: auditCreateSpy },
      } as unknown as PrismaClient;

      const customApi = _buildCustomApiStub(
        { spec: { policyRef: "deny-all" } },
        { spec: { mcpServers: { deny: ["retrieval"] } } },
      );
      const app = _buildRetrievalApp(customApi, prisma);

      await request(app)
        .post("/api/retrieval/query")
        .send({ query: "secret", tenantName: "acme", datasetScope: "org", datasetId: "default" });

      expect(auditCreateSpy).toHaveBeenCalledOnce();
      const auditCall = auditCreateSpy.mock.calls[0][0];
      expect(auditCall.data.action).toBe("RetrievalDenied");
      expect(auditCall.data.tenant).toBe("acme");
    });
  });

  describe("POST /api/retrieval/query — content excerpt truncation", () =>
  {
    it("truncates large content to 500 characters in the response", async () =>
    {
      const longContent = "A".repeat(2000);
      const mockDocs = [
        {
          id: "doc-3",
          source: "slack",
          sourceId: "C999/001",
          owner: "eng",
          teamScope: null,
          sensitivityTags: [],
          title: null,
          content: longContent,
          contentHash: null,
          embeddingReady: false,
          ingestedAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const prisma = _buildPrismaStub({ orgDocuments: mockDocs });
      const customApi = _buildCustomApiStub({ spec: {} }, {});
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app)
        .post("/api/retrieval/query")
        .send({ query: "anything", tenantName: "acme", datasetScope: "org", datasetId: "default" });

      expect(response.status).toBe(200);
      expect(response.body.results[0].contentExcerpt.length).toBeLessThanOrEqual(500);
    });
  });

  describe("GET /api/retrieval/health", () =>
  {
    it("returns 200 with document count and source breakdown", async () =>
    {
      const prisma = {
        orgDocument: {
          count: vi.fn().mockResolvedValue(42),
          groupBy: vi.fn().mockResolvedValue([
            { source: "slack", _count: { id: 30 } },
            { source: "confluence", _count: { id: 12 } },
          ]),
          findMany: vi.fn(),
        },
        tenant: { findUnique: vi.fn() },
        auditEntry: { create: vi.fn() },
      } as unknown as PrismaClient;

      const customApi = _buildCustomApiStub({}, {});
      const app = _buildRetrievalApp(customApi, prisma);

      const response = await request(app).get("/api/retrieval/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
      expect(response.body.totalDocuments).toBe(42);
      expect(response.body.sources).toHaveLength(2);
      expect(response.body.sources[0].source).toBe("slack");
    });
  });
});
