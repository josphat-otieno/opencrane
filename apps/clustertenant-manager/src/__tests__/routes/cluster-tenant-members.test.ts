import express from "express";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clusterTenantMembersRouter } from "../../routes/cluster-tenant-members.js";

/**
 * Route tests for the org MEMBER management API (S3c):
 *   - list / add (upsert) / remove the local OrgMembership rows,
 *   - the last-Owner guardrail (409 on demoting/removing the sole Owner),
 *   - 404 when the org (or membership) is missing,
 *   - the org-manager gate (403 for a non-member; allow operator + owner/admin).
 */

type Row = Record<string, unknown>;

/** A membership fixture row. */
interface Membership { clusterTenant: string; subject: string; role: "Owner" | "Admin" | "Member" }

/** Seed shape for the in-memory fixtures. */
interface Seed
{
  orgs?: string[];
  memberships?: Membership[];
}

/**
 * Build a Prisma stub backed by in-memory arrays for the membership tables.
 * Implements only the surface the members router touches: clusterTenant.findUnique,
 * and orgMembership.{findMany,findUnique,count,upsert,delete}.
 */
function _mockPrisma(seed: Seed = {}): { prisma: PrismaClient; memberships: Membership[] }
{
  const orgs = new Set(seed.orgs ?? []);
  const memberships: Membership[] = (seed.memberships ?? []).map(m => ({ ...m }));

  const _find = (clusterTenant: string, subject: string): Membership | undefined =>
    memberships.find(m => m.clusterTenant === clusterTenant && m.subject === subject);

  const prisma = {
    clusterTenant: {
      findUnique: vi.fn(async function _findUnique(args: { where: { name: string } }) { return orgs.has(args.where.name) ? { name: args.where.name } : null; }),
    },
    orgMembership: {
      findMany: vi.fn(async function _findMany(args: { where: { clusterTenant: string } })
      {
        return memberships.filter(m => m.clusterTenant === args.where.clusterTenant).map(m => ({ subject: m.subject, role: m.role }));
      }),
      findUnique: vi.fn(async function _findUnique(args: { where: { clusterTenant_subject: { clusterTenant: string; subject: string } } })
      {
        const { clusterTenant, subject } = args.where.clusterTenant_subject;
        const m = _find(clusterTenant, subject);
        return m ? { role: m.role } : null;
      }),
      count: vi.fn(async function _count(args: { where: { clusterTenant: string; role: string } })
      {
        return memberships.filter(m => m.clusterTenant === args.where.clusterTenant && m.role === args.where.role).length;
      }),
      upsert: vi.fn(async function _upsert(args: { where: { clusterTenant_subject: { clusterTenant: string; subject: string } }; create: Membership; update: { role: Membership["role"] } })
      {
        const { clusterTenant, subject } = args.where.clusterTenant_subject;
        const existing = _find(clusterTenant, subject);
        if (existing) { existing.role = args.update.role; return { subject, role: existing.role }; }
        memberships.push({ ...args.create }); return { subject, role: args.create.role };
      }),
      delete: vi.fn(async function _delete(args: { where: { clusterTenant_subject: { clusterTenant: string; subject: string } } })
      {
        const { clusterTenant, subject } = args.where.clusterTenant_subject;
        const idx = memberships.findIndex(m => m.clusterTenant === clusterTenant && m.subject === subject);
        if (idx >= 0) memberships.splice(idx, 1);
        return {};
      }),
    },
  } as unknown as PrismaClient;

  return { prisma, memberships };
}

/** Session user shape (subset of the OIDC session user). */
interface User { sub: string; isPlatformOperator: boolean }

/** Mount the members router under the org `:name`, optionally seeding a session user. */
function _buildApp(prisma: PrismaClient, user?: User): Express
{
  const app = express();
  app.use(express.json());
  if (user)
  {
    app.use(function _seedSession(req, _res, next) { (req as unknown as { session: { authUser: User } }).session = { authUser: user }; next(); });
  }
  app.use("/api/v1/cluster-tenants/:name/members", clusterTenantMembersRouter(prisma));
  return app;
}

describe("clusterTenantMembersRouter — org member management (S3c)", function _suite()
{
  const _AUTH_ENV = ["OPENCRANE_API_TOKEN", "OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI", "OIDC_SESSION_SECRET"] as const;
  const _saved: Record<string, string | undefined> = {};

  /** Force REAL-auth mode so the org-manager gate exercises its fail-closed posture. */
  beforeEach(function _enableAuth()
  {
    for (const key of _AUTH_ENV) { _saved[key] = process.env[key]; delete process.env[key]; }
    process.env.OPENCRANE_API_TOKEN = "ci-token";
  });

  afterEach(function _restoreEnv()
  {
    for (const key of _AUTH_ENV) { if (_saved[key] === undefined) { delete process.env[key]; } else { process.env[key] = _saved[key]; } }
  });

  const _owner: User = { sub: "owner-1", isPlatformOperator: false };

  // --- list ----------------------------------------------------------------

  it("lists the org's members (subject + role) for an owner", async function _list()
  {
    const { prisma } = _mockPrisma({ orgs: ["acme"], memberships: [
      { clusterTenant: "acme", subject: "owner-1", role: "Owner" },
      { clusterTenant: "acme", subject: "user-2", role: "Member" },
    ] });
    const res = await request(_buildApp(prisma, _owner)).get("/api/v1/cluster-tenants/acme/members");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toContainEqual({ subject: "user-2", role: "Member" });
  });

  it("returns 404 listing members of a missing org", async function _listMissing()
  {
    const { prisma } = _mockPrisma({ orgs: [] });
    const res = await request(_buildApp(prisma, { sub: "op", isPlatformOperator: true })).get("/api/v1/cluster-tenants/ghost/members");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CLUSTER_TENANT_NOT_FOUND");
  });

  // --- add / upsert --------------------------------------------------------

  it("adds a new member (upsert) and returns it", async function _add()
  {
    const { prisma, memberships } = _mockPrisma({ orgs: ["acme"], memberships: [{ clusterTenant: "acme", subject: "owner-1", role: "Owner" }] });
    const res = await request(_buildApp(prisma, _owner)).post("/api/v1/cluster-tenants/acme/members").send({ subject: "user-2", role: "Admin" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subject: "user-2", role: "Admin" });
    expect(memberships).toContainEqual({ clusterTenant: "acme", subject: "user-2", role: "Admin" });
  });

  it("updates an existing member's role on upsert", async function _upsert()
  {
    const { prisma, memberships } = _mockPrisma({ orgs: ["acme"], memberships: [
      { clusterTenant: "acme", subject: "owner-1", role: "Owner" },
      { clusterTenant: "acme", subject: "user-2", role: "Member" },
    ] });
    const res = await request(_buildApp(prisma, _owner)).post("/api/v1/cluster-tenants/acme/members").send({ subject: "user-2", role: "Admin" });

    expect(res.status).toBe(200);
    expect(memberships.find(m => m.subject === "user-2")?.role).toBe("Admin");
  });

  it("rejects an add with an invalid role (400)", async function _addBadRole()
  {
    const { prisma } = _mockPrisma({ orgs: ["acme"], memberships: [{ clusterTenant: "acme", subject: "owner-1", role: "Owner" }] });
    const res = await request(_buildApp(prisma, _owner)).post("/api/v1/cluster-tenants/acme/members").send({ subject: "user-2", role: "Superuser" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 adding a member to a missing org", async function _addMissingOrg()
  {
    const { prisma } = _mockPrisma({ orgs: [] });
    const res = await request(_buildApp(prisma, { sub: "op", isPlatformOperator: true })).post("/api/v1/cluster-tenants/ghost/members").send({ subject: "x", role: "Member" });

    expect(res.status).toBe(404);
  });

  // --- last-Owner guardrail ------------------------------------------------

  it("rejects demoting the org's last Owner with 409 LAST_OWNER", async function _demoteLastOwner()
  {
    const { prisma, memberships } = _mockPrisma({ orgs: ["acme"], memberships: [{ clusterTenant: "acme", subject: "owner-1", role: "Owner" }] });
    const res = await request(_buildApp(prisma, _owner)).post("/api/v1/cluster-tenants/acme/members").send({ subject: "owner-1", role: "Admin" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAST_OWNER");
    // The Owner row must be untouched.
    expect(memberships.find(m => m.subject === "owner-1")?.role).toBe("Owner");
  });

  it("allows demoting an Owner when another Owner remains", async function _demoteWithSpareOwner()
  {
    const { prisma, memberships } = _mockPrisma({ orgs: ["acme"], memberships: [
      { clusterTenant: "acme", subject: "owner-1", role: "Owner" },
      { clusterTenant: "acme", subject: "owner-2", role: "Owner" },
    ] });
    const res = await request(_buildApp(prisma, _owner)).post("/api/v1/cluster-tenants/acme/members").send({ subject: "owner-1", role: "Admin" });

    expect(res.status).toBe(200);
    expect(memberships.find(m => m.subject === "owner-1")?.role).toBe("Admin");
  });

  it("rejects removing the org's last Owner with 409 LAST_OWNER", async function _removeLastOwner()
  {
    const { prisma, memberships } = _mockPrisma({ orgs: ["acme"], memberships: [{ clusterTenant: "acme", subject: "owner-1", role: "Owner" }] });
    const res = await request(_buildApp(prisma, _owner)).delete("/api/v1/cluster-tenants/acme/members/owner-1");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LAST_OWNER");
    expect(memberships).toHaveLength(1);
  });

  // --- remove --------------------------------------------------------------

  it("removes a non-Owner member", async function _remove()
  {
    const { prisma, memberships } = _mockPrisma({ orgs: ["acme"], memberships: [
      { clusterTenant: "acme", subject: "owner-1", role: "Owner" },
      { clusterTenant: "acme", subject: "user-2", role: "Member" },
    ] });
    const res = await request(_buildApp(prisma, _owner)).delete("/api/v1/cluster-tenants/acme/members/user-2");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subject: "user-2", status: "removed" });
    expect(memberships.find(m => m.subject === "user-2")).toBeUndefined();
  });

  it("returns 404 removing a member who is not in the org", async function _removeMissingMember()
  {
    const { prisma } = _mockPrisma({ orgs: ["acme"], memberships: [{ clusterTenant: "acme", subject: "owner-1", role: "Owner" }] });
    const res = await request(_buildApp(prisma, _owner)).delete("/api/v1/cluster-tenants/acme/members/ghost");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MEMBERSHIP_NOT_FOUND");
  });

  // --- org-manager gate ----------------------------------------------------

  it("denies a non-member listing/managing someone else's org members (403)", async function _nonMember()
  {
    const { prisma } = _mockPrisma({ orgs: ["acme"], memberships: [{ clusterTenant: "acme", subject: "owner-1", role: "Owner" }] });
    const app = _buildApp(prisma, { sub: "stranger", isPlatformOperator: false });

    const list = await request(app).get("/api/v1/cluster-tenants/acme/members");
    expect(list.status).toBe(403);
    expect(list.body.code).toBe("FORBIDDEN_ORG_SCOPE");

    const add = await request(app).post("/api/v1/cluster-tenants/acme/members").send({ subject: "x", role: "Member" });
    expect(add.status).toBe(403);
  });

  it("denies a plain Member managing the org's members (403)", async function _plainMember()
  {
    const { prisma } = _mockPrisma({ orgs: ["acme"], memberships: [{ clusterTenant: "acme", subject: "user-3", role: "Member" }] });
    const res = await request(_buildApp(prisma, { sub: "user-3", isPlatformOperator: false })).post("/api/v1/cluster-tenants/acme/members").send({ subject: "x", role: "Member" });

    expect(res.status).toBe(403);
  });

  it("lets a platform operator manage any org's members", async function _operator()
  {
    const { prisma, memberships } = _mockPrisma({ orgs: ["acme"], memberships: [{ clusterTenant: "acme", subject: "owner-1", role: "Owner" }] });
    const res = await request(_buildApp(prisma, { sub: "op", isPlatformOperator: true })).post("/api/v1/cluster-tenants/acme/members").send({ subject: "user-9", role: "Member" });

    expect(res.status).toBe(200);
    expect(memberships).toContainEqual({ clusterTenant: "acme", subject: "user-9", role: "Member" });
  });
});
