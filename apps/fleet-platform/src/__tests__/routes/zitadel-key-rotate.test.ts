import express from "express";
import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _log } from "../../log.js";
import { zitadelKeyRouter } from "../../routes/admin/zitadel-key.js";
import type { ZitadelKeySecretStore } from "../../infra/zitadel/key-secret-store.js";
import type { ZitadelCandidateKeyValidation, ZitadelManagementClient } from "../../infra/zitadel/zitadel-client.types.js";

/**
 * Security-critical matrix for the platform Zitadel SA-key rotation (the master IdP
 * credential). The whole point is the SAFE-ROTATION invariant: the live key is swapped ONLY
 * when the candidate validates (token exchange + instance IAM_OWNER) AND persists; otherwise
 * the old key stays active and neither the Secret nor the in-memory key changes.
 */

/** A spyable Zitadel client double; `validation` controls the candidate-validation result. */
function _fakeClient(validation: ZitadelCandidateKeyValidation): {
  client: ZitadelManagementClient;
  reloadKey: ReturnType<typeof vi.fn>;
  validateCandidateKey: ReturnType<typeof vi.fn>;
}
{
  const reloadKey = vi.fn();
  const validateCandidateKey = vi.fn(async function _v() { return validation; });
  const client = {
    async provisionOrg() { throw new Error("unused"); },
    async setAppRedirectUris() { /* unused */ },
    async teardownOrg() { /* unused */ },
    validateCandidateKey,
    currentKeyId() { return "old-key-id"; },
    reloadKey,
  } as unknown as ZitadelManagementClient;
  return { client, reloadKey, validateCandidateKey };
}

/** A spyable secret-store double. */
function _fakeStore(opts: { configured?: boolean; persistThrows?: boolean } = {}): { store: ZitadelKeySecretStore; persistKey: ReturnType<typeof vi.fn> }
{
  const persistKey = vi.fn(async function _p() { if (opts.persistThrows) { throw new Error("secret patch failed"); } });
  const store: ZitadelKeySecretStore = {
    isConfigured() { return opts.configured ?? true; },
    persistKey,
  };
  return { store, persistKey };
}

/** A passing validation result (both flags true). */
const _OK: ZitadelCandidateKeyValidation = { tokenExchangeOk: true, instanceScopeOk: true, keyId: "new-key-id", detail: "ok" };

/** Session user shape (subset of the OIDC session user). */
interface User { sub: string; isPlatformOperator: boolean }

/** Mount the router, optionally seeding a session user. */
function _buildApp(client: ZitadelManagementClient, store: ZitadelKeySecretStore, user?: User): Express
{
  const app = express();
  app.use(express.json());
  if (user)
  {
    app.use(function _seedSession(req, _res, next) { (req as unknown as { session: { authUser: User } }).session = { authUser: user }; next(); });
  }
  app.use("/api/v1/admin/zitadel", zitadelKeyRouter(client, store));
  return app;
}

describe("zitadelKeyRouter — POST /sa-key:rotate (safe-rotation gate)", function _suite()
{
  // Force REAL-auth mode so the platform-operator gate fail-closes for non-operators.
  const _AUTH_ENV = ["OPENCRANE_API_TOKEN", "OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI", "OIDC_SESSION_SECRET"] as const;
  const _saved: Record<string, string | undefined> = {};

  beforeEach(function _enableAuth()
  {
    for (const key of _AUTH_ENV) { _saved[key] = process.env[key]; delete process.env[key]; }
    process.env.OPENCRANE_API_TOKEN = "ci-token";
  });

  afterEach(function _restoreEnv()
  {
    for (const key of _AUTH_ENV) { if (_saved[key] === undefined) { delete process.env[key]; } else { process.env[key] = _saved[key]; } }
  });

  it("rotates only when both validation flags pass: persists FIRST, then reloads the live key", async function _rotates()
  {
    const { client, reloadKey, validateCandidateKey } = _fakeClient(_OK);
    const { store, persistKey } = _fakeStore({ configured: true });
    const res = await request(_buildApp(client, store, { sub: "op", isPlatformOperator: true }))
      .post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: "{\"keyId\":\"new-key-id\"}" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rotated: true, keyId: "new-key-id", previousKeyId: "old-key-id" });
    expect(validateCandidateKey).toHaveBeenCalledOnce();
    // Persist-first: the Secret write happened before the in-memory swap.
    expect(persistKey).toHaveBeenCalledOnce();
    expect(reloadKey).toHaveBeenCalledOnce();
    expect(persistKey.mock.invocationCallOrder[0]).toBeLessThan(reloadKey.mock.invocationCallOrder[0]);
  });

  it("returns 422 and makes NO change when the instance-scope probe fails", async function _scopeFail()
  {
    const { client, reloadKey } = _fakeClient({ tokenExchangeOk: true, instanceScopeOk: false, keyId: "new-key-id", detail: "scope" });
    const { store, persistKey } = _fakeStore({ configured: true });
    const res = await request(_buildApp(client, store, { sub: "op", isPlatformOperator: true }))
      .post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: "{}" });

    expect(res.status).toBe(422);
    expect(res.body.rotated).toBe(false);
    // The old key stays active: neither persisted nor reloaded.
    expect(persistKey).not.toHaveBeenCalled();
    expect(reloadKey).not.toHaveBeenCalled();
  });

  it("returns 422 and makes NO change when the token exchange fails", async function _tokenFail()
  {
    const { client, reloadKey } = _fakeClient({ tokenExchangeOk: false, instanceScopeOk: false, keyId: null, detail: "token" });
    const { store, persistKey } = _fakeStore({ configured: true });
    const res = await request(_buildApp(client, store, { sub: "op", isPlatformOperator: true }))
      .post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: "{}" });

    expect(res.status).toBe(422);
    expect(persistKey).not.toHaveBeenCalled();
    expect(reloadKey).not.toHaveBeenCalled();
  });

  it("does NOT reload the live key when persistence fails AFTER a passing validation (500, old key stays)", async function _persistFails()
  {
    const { client, reloadKey } = _fakeClient(_OK);
    const { store } = _fakeStore({ configured: true, persistThrows: true });
    const res = await request(_buildApp(client, store, { sub: "op", isPlatformOperator: true }))
      .post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: "{}" });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("KEY_PERSIST_FAILED");
    // Persist-first guarantee: a failed persist must NEVER reach the in-memory swap.
    expect(reloadKey).not.toHaveBeenCalled();
  });

  it("returns 409 (and never validates) when key-Secret persistence is not configured", async function _notConfigured()
  {
    const { client, validateCandidateKey, reloadKey } = _fakeClient(_OK);
    const { store, persistKey } = _fakeStore({ configured: false });
    const res = await request(_buildApp(client, store, { sub: "op", isPlatformOperator: true }))
      .post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: "{}" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SECRET_PERSISTENCE_NOT_CONFIGURED");
    expect(validateCandidateKey).not.toHaveBeenCalled();
    expect(persistKey).not.toHaveBeenCalled();
    expect(reloadKey).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-operator (platform-operator gate, fail-closed)", async function _nonOperator()
  {
    const { client, validateCandidateKey } = _fakeClient(_OK);
    const { store } = _fakeStore({ configured: true });
    const res = await request(_buildApp(client, store, { sub: "user-1", isPlatformOperator: false }))
      .post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: "{}" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN_NOT_PLATFORM_OPERATOR");
    // The gate fires before any work — the candidate is never validated.
    expect(validateCandidateKey).not.toHaveBeenCalled();
  });

  it("returns 403 for an anonymous caller under real-auth mode (fail-closed)", async function _anon()
  {
    const { client } = _fakeClient(_OK);
    const { store } = _fakeStore({ configured: true });
    const res = await request(_buildApp(client, store)).post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: "{}" });

    expect(res.status).toBe(403);
  });

  it("never logs the candidate key material on either the rotate or the reject path", async function _noSecretLog()
  {
    const secret = "{\"keyId\":\"new-key-id\",\"key\":\"-----BEGIN RSA PRIVATE KEY-----SUPER-SECRET-PEM-----END RSA PRIVATE KEY-----\",\"userId\":\"u1\"}";
    const seen: unknown[] = [];
    const infoSpy = vi.spyOn(_log, "info").mockImplementation(((obj: unknown) => { seen.push(obj); return _log; }) as never);
    const warnSpy = vi.spyOn(_log, "warn").mockImplementation(((obj: unknown) => { seen.push(obj); return _log; }) as never);

    // Rotate (success) path.
    const ok = _fakeClient(_OK);
    await request(_buildApp(ok.client, _fakeStore({ configured: true }).store, { sub: "op", isPlatformOperator: true }))
      .post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: secret });
    // Reject (422) path.
    const bad = _fakeClient({ tokenExchangeOk: false, instanceScopeOk: false, keyId: null, detail: "token" });
    await request(_buildApp(bad.client, _fakeStore({ configured: true }).store, { sub: "op", isPlatformOperator: true }))
      .post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: secret });

    const serialised = JSON.stringify(seen);
    expect(serialised).not.toContain("SUPER-SECRET-PEM");
    expect(serialised).not.toContain("BEGIN RSA PRIVATE KEY");
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("returns 400 when the request omits a usable serviceAccountKey", async function _badBody()
  {
    const { client } = _fakeClient(_OK);
    const { store } = _fakeStore({ configured: true });
    const res = await request(_buildApp(client, store, { sub: "op", isPlatformOperator: true }))
      .post("/api/v1/admin/zitadel/sa-key:rotate").send({ serviceAccountKey: "   " });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });
});
