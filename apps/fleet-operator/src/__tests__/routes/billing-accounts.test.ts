import express from "express";
import type { Express } from "express";
import type { PrismaClient } from "../../generated/prisma/index.js";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { billingAccountsRouter } from "../../routes/billing-accounts.js";

/**
 * Covers the self-serve billing-account endpoint (ORG-ADMIN.2): a user creates their
 * OWN account keyed to the session subject (never request input), idempotently, and
 * the fail-closed / dev-mode posture matches the rest of the platform.
 */

/** Auth env that decides `_IsDevAuthMode`; cleared/restored around each test. */
const _AUTH_ENV = ["OPENCRANE_API_TOKEN", "OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI", "OIDC_SESSION_SECRET"] as const;

/** Minimal in-memory billing-account stub keyed by subject. */
function _mockPrisma(): { prisma: PrismaClient; store: Map<string, Record<string, unknown>> }
{
  const store = new Map<string, Record<string, unknown>>();
  const prisma = {
    billingAccount: {
      findUnique: vi.fn(async function _findUnique(args: { where: { subject: string } }) { return store.get(args.where.subject) ?? null; }),
      upsert: vi.fn(async function _upsert(args: { where: { subject: string }; create: Record<string, unknown> })
      {
        const existing = store.get(args.where.subject);
        if (existing)
        {
          // Mirror Prisma's @updatedAt: an upsert that hits an existing row bumps
          // updatedAt, so createdAt !== updatedAt marks it as pre-existing (200).
          existing.updatedAt = new Date(Date.now() + 1000);
          return existing;
        }
        const now = new Date();
        const row = { id: `ba_${args.where.subject}`, email: null, displayName: null, ...args.create, createdAt: now, updatedAt: now };
        store.set(args.where.subject, row);
        return row;
      }),
    },
  } as unknown as PrismaClient;
  return { prisma, store };
}

/** Mount the router, optionally seeding a session user. */
function _buildApp(prisma: PrismaClient, user?: { sub: string; email?: string }): Express
{
  const app = express();
  app.use(express.json());
  if (user)
  {
    app.use(function _seedSession(req, _res, next) { (req as unknown as { session: { authUser: typeof user } }).session = { authUser: user }; next(); });
  }
  app.use("/api/v1/billing-accounts", billingAccountsRouter(prisma));
  return app;
}

describe("billingAccountsRouter (ORG-ADMIN.2)", function _suite()
{
  const _saved: Record<string, string | undefined> = {};

  /** Force REAL-auth mode by default so the fail-closed posture is exercised. */
  beforeEach(function _enableAuth()
  {
    for (const key of _AUTH_ENV) { _saved[key] = process.env[key]; delete process.env[key]; }
    process.env.OPENCRANE_API_TOKEN = "ci-token";
  });

  afterEach(function _restoreEnv()
  {
    for (const key of _AUTH_ENV) { if (_saved[key] === undefined) { delete process.env[key]; } else { process.env[key] = _saved[key]; } }
  });

  it("creates the caller's own account keyed to the session subject (201)", async function _create()
  {
    const { prisma, store } = _mockPrisma();
    const res = await request(_buildApp(prisma, { sub: "user-1", email: "user@acme.io" })).post("/api/v1/billing-accounts").send({ displayName: "Acme" });

    expect(res.status).toBe(201);
    expect(res.body.subject).toBe("user-1");
    expect(res.body.displayName).toBe("Acme");
    // The account is keyed to the session subject, never request input.
    expect(store.get("user-1")).toBeTruthy();
  });

  it("is idempotent per subject — a repeat create returns 200 with the existing account", async function _idempotent()
  {
    const { prisma } = _mockPrisma();
    const app = _buildApp(prisma, { sub: "user-1" });

    const first = await request(app).post("/api/v1/billing-accounts").send({});
    expect(first.status).toBe(201);
    const second = await request(app).post("/api/v1/billing-accounts").send({});
    expect(second.status).toBe(200);
    expect(second.body.subject).toBe("user-1");
  });

  it("rejects an anonymous create with 401 in a real-auth deployment (fail-closed)", async function _anon()
  {
    const { prisma, store } = _mockPrisma();
    const res = await request(_buildApp(prisma)).post("/api/v1/billing-accounts").send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(store.size).toBe(0);
  });

  it("GET /me returns 404 when the caller has no account, 200 once created", async function _getMe()
  {
    const { prisma } = _mockPrisma();
    const app = _buildApp(prisma, { sub: "user-1" });

    const missing = await request(app).get("/api/v1/billing-accounts/me");
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("BILLING_ACCOUNT_NOT_FOUND");

    await request(app).post("/api/v1/billing-accounts").send({});
    const found = await request(app).get("/api/v1/billing-accounts/me");
    expect(found.status).toBe(200);
    expect(found.body.subject).toBe("user-1");
  });

  it("allows an anonymous create under the dev-mode bypass (no real auth configured)", async function _dev()
  {
    delete process.env.OPENCRANE_API_TOKEN; // no OIDC, no token ⇒ dev mode
    const { prisma, store } = _mockPrisma();
    const res = await request(_buildApp(prisma)).post("/api/v1/billing-accounts").send({});

    expect(res.status).toBe(201);
    expect(store.get("dev-local-subject")).toBeTruthy();
  });
});
