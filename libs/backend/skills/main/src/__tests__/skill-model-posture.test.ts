import express from "express";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { skillModelPostureRouter } from "../routes/skill-model-posture.js";

/** In-memory skills store backing the mock Prisma client, keyed by the compound (name, scope, team). */
type Row = Record<string, unknown>;

/** A session-bearing user, used to exercise the ClusterTenant scope guard. */
interface SessionUser
{
  /** Verified email used by the guard's fail-closed tenant lookup. */
  email: string;
  /** Whether the caller is a platform operator. */
  isPlatformOperator: boolean;
}

/** Build a Prisma stub over an in-memory map of `Skill` rows. */
function _mockPrisma(store: Map<string, Row>, tenantClusterTenant: string | null = null): PrismaClient
{
  function _key(name: string, scope: string, team: string): string { return `${name}|${scope}|${team}`; }
  return {
    tenant: {
      findMany: async function _findMany() { return tenantClusterTenant ? [{ clusterTenantRef: tenantClusterTenant }] : []; },
    },
    skill: {
      findMany: async function _list() { return Array.from(store.values()); },
      findUnique: async function _findUnique(args: { where: { name_scope_team: { name: string; scope: string; team: string } } })
      {
        const k = args.where.name_scope_team;
        return store.get(_key(k.name, k.scope, k.team)) ?? null;
      },
      update: async function _update(args: { where: { name_scope_team: { name: string; scope: string; team: string } }; data: Row })
      {
        const k = args.where.name_scope_team;
        const row = { ...(store.get(_key(k.name, k.scope, k.team)) as Row), ...args.data, updatedAt: new Date("2026-06-18T00:00:00.000Z") };
        store.set(_key(k.name, k.scope, k.team), row);
        return row;
      },
    },
  } as unknown as PrismaClient;
}

/** Seed a single skill row with defaults. */
function _skill(over: Partial<Row>): Row
{
  const now = new Date("2026-06-18T00:00:00.000Z");
  return { name: "summarise", scope: "team", team: "acme", path: "skills/summarise", modelMode: null, pinnedModel: null, autoConfig: null, createdAt: now, updatedAt: now, ...over };
}

/** Build a minimal app mounting the posture router, optionally seeding a session user. */
function _buildApp(prisma: PrismaClient, user?: SessionUser): Express
{
  const app = express();
  app.use(express.json());
  if (user)
  {
    app.use(function _seedSession(req, _res, next) { (req as unknown as { session: { authUser: SessionUser } }).session = { authUser: user }; next(); });
  }
  app.use("/api/v1/skills/posture", skillModelPostureRouter(prisma));
  return app;
}

/** A valid auto-routing config for write bodies. */
function _autoConfig(): Record<string, unknown>
{
  return { objective: "balanced", sessionPin: true, explorationRate: 0 };
}

describe("skillModelPostureRouter", function _suite()
{
  it("lists skills with posture", async function _list()
  {
    const store = new Map<string, Row>([["summarise|team|acme", _skill({})]]);
    const res = await request(_buildApp(_mockPrisma(store))).get("/api/v1/skills/posture");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].modelMode).toBeNull();
  });

  it("sets a pinned posture", async function _setPinned()
  {
    const store = new Map<string, Row>([["summarise|team|acme", _skill({})]]);
    const res = await request(_buildApp(_mockPrisma(store)))
      .put("/api/v1/skills/posture/skill?name=summarise&scope=team&team=acme")
      .send({ modelMode: "pinned", pinnedModel: "openai/gpt-4o" });

    expect(res.status).toBe(200);
    expect(res.body.modelMode).toBe("pinned");
    expect(res.body.pinnedModel).toBe("openai/gpt-4o");
  });

  it("rejects pinned without a pinnedModel (400)", async function _pinnedMissingModel()
  {
    const store = new Map<string, Row>([["summarise|team|acme", _skill({})]]);
    const res = await request(_buildApp(_mockPrisma(store)))
      .put("/api/v1/skills/posture/skill?name=summarise&scope=team&team=acme")
      .send({ modelMode: "pinned" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("sets an auto posture with a valid config", async function _setAuto()
  {
    const store = new Map<string, Row>([["summarise|team|acme", _skill({})]]);
    const res = await request(_buildApp(_mockPrisma(store)))
      .put("/api/v1/skills/posture/skill?name=summarise&scope=team&team=acme")
      .send({ modelMode: "auto", autoConfig: _autoConfig() });

    expect(res.status).toBe(200);
    expect(res.body.modelMode).toBe("auto");
    expect(res.body.autoConfig.objective).toBe("balanced");
  });

  it("rejects auto with a malformed config (400)", async function _autoBadConfig()
  {
    const store = new Map<string, Row>([["summarise|team|acme", _skill({})]]);
    const res = await request(_buildApp(_mockPrisma(store)))
      .put("/api/v1/skills/posture/skill?name=summarise&scope=team&team=acme")
      .send({ modelMode: "auto", autoConfig: { objective: "balanced" } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("clears the posture with modelMode null", async function _clear()
  {
    const store = new Map<string, Row>([["summarise|team|acme", _skill({ modelMode: "Pinned", pinnedModel: "x" })]]);
    const res = await request(_buildApp(_mockPrisma(store)))
      .put("/api/v1/skills/posture/skill?name=summarise&scope=team&team=acme")
      .send({ modelMode: null });

    expect(res.status).toBe(200);
    expect(res.body.modelMode).toBeNull();
    expect(res.body.pinnedModel).toBeNull();
  });

  it("returns 404 for an unknown skill", async function _notFound()
  {
    const res = await request(_buildApp(_mockPrisma(new Map())))
      .put("/api/v1/skills/posture/skill?name=nope&scope=team&team=acme")
      .send({ modelMode: null });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("SKILL_NOT_FOUND");
  });

  it("scope guard: a non-operator may NOT set posture on an org/global skill (403)", async function _guardGlobal()
  {
    const store = new Map<string, Row>([["org-skill|org|", _skill({ name: "org-skill", scope: "org", team: "" })]]);
    const app = _buildApp(_mockPrisma(store), { email: "user@acme.test", isPlatformOperator: false });
    const res = await request(app)
      .put("/api/v1/skills/posture/skill?name=org-skill&scope=org&team=")
      .send({ modelMode: null });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN_SCOPE");
  });

  it("scope guard: a non-operator may set posture on a skill owned by their OWN team/ClusterTenant", async function _guardOwn()
  {
    const store = new Map<string, Row>([["summarise|team|acme", _skill({})]]);
    const app = _buildApp(_mockPrisma(store, "acme"), { email: "user@acme.test", isPlatformOperator: false });
    const res = await request(app)
      .put("/api/v1/skills/posture/skill?name=summarise&scope=team&team=acme")
      .send({ modelMode: "pinned", pinnedModel: "openai/gpt-4o" });

    expect(res.status).toBe(200);
    expect(res.body.pinnedModel).toBe("openai/gpt-4o");
  });

  it("scope guard: a non-operator may NOT set posture on another team's skill (403)", async function _guardOther()
  {
    const store = new Map<string, Row>([["summarise|team|other", _skill({ team: "other" })]]);
    const app = _buildApp(_mockPrisma(store, "acme"), { email: "user@acme.test", isPlatformOperator: false });
    const res = await request(app)
      .put("/api/v1/skills/posture/skill?name=summarise&scope=team&team=other")
      .send({ modelMode: null });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN_SCOPE");
  });
});
