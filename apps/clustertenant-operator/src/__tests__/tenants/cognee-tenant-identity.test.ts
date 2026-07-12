import { Buffer } from "node:buffer";

import * as k8s from "@kubernetes/client-node";
import pino from "pino";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { defaultConfig, _makeTenant } from "../fixtures.js";
import { CogneeTenantIdentity, _CredentialsSecretName } from "../../tenants/internal/cognee-tenant-identity.js";
import type { OpenClawTenantOperatorConfig } from "../../config.js";

const _log = pino({ level: "silent" });

/** Config with Cognee wired, the baseline for these tests. */
const _enabledConfig: OpenClawTenantOperatorConfig = {
  ...defaultConfig,
  cogneeEndpoint: "http://cognee:8000",
};

/** A stable 32-byte encryption key (base64), matching TenantEncryptionKeys's Secret shape. */
const _ENCRYPTION_KEY_BASE64 = Buffer.from("b".repeat(32)).toString("base64");

/**
 * Stub CoreV1Api distinguishing the two Secrets this class reads: the tenant's own
 * cognee-credentials Secret (idempotency check) and its encryption-key Secret (password
 * derivation input).
 */
function _makeCoreApi(opts: { credentialsExist?: boolean; encryptionKeyBase64?: string | null } = {}): k8s.CoreV1Api
{
  const { credentialsExist = false, encryptionKeyBase64 = _ENCRYPTION_KEY_BASE64 } = opts;
  return {
    readNamespacedSecret: vi.fn().mockImplementation(function _read({ name }: { name: string }): Promise<k8s.V1Secret>
    {
      if (name.endsWith("-cognee-credentials"))
      {
        if (!credentialsExist)
        {
          return Promise.reject(new Error("404 not found"));
        }

        return Promise.resolve({
          data: {
            username: Buffer.from("acme@example.com").toString("base64"),
            password: Buffer.from("already-set-password").toString("base64"),
          },
        } as unknown as k8s.V1Secret);
      }

      if (name.endsWith("-encryption-key"))
      {
        if (encryptionKeyBase64 === null)
        {
          // Secret exists but carries no "key" field (distinct from a missing Secret,
          // which would reject instead — see the "Secret missing" test below).
          return Promise.resolve({ data: {} } as unknown as k8s.V1Secret);
        }

        return Promise.resolve({ data: { key: encryptionKeyBase64 } } as unknown as k8s.V1Secret);
      }

      return Promise.reject(new Error(`unexpected secret name: ${name}`));
    }),
  } as unknown as k8s.CoreV1Api;
}

/** Stub KubernetesObjectApi recording server-side applies without a cluster. */
function _makeObjectApi(): k8s.KubernetesObjectApi
{
  return {
    read: vi.fn().mockRejectedValue(new Error("not found")),
    patch: vi.fn().mockResolvedValue({ body: {} }),
    create: vi.fn().mockResolvedValue({ body: {} }),
  } as unknown as k8s.KubernetesObjectApi;
}

describe("CogneeTenantIdentity", () =>
{
  beforeEach(() =>
  {
    vi.restoreAllMocks();
  });

  afterEach(() =>
  {
    vi.unstubAllGlobals();
  });

  it("is a no-op when Cognee is not configured for this silo", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const coreApi = _makeCoreApi();

    const identity = new CogneeTenantIdentity(defaultConfig, coreApi, _makeObjectApi(), _log);
    await identity.ensureTenantCogneeIdentity(_makeTenant("acme"), "default");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(coreApi.readNamespacedSecret as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("skips re-registration when the existing login still authenticates (verifies liveness, not mere Secret existence)", async () =>
  {
    // Secret present AND a login attempt succeeds → converged, no re-register / no Secret write.
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      if (url.endsWith("/api/v1/auth/login")) { return new Response(JSON.stringify({ access_token: "jwt" }), { status: 200 }); }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const objectApi = _makeObjectApi();

    const identity = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi({ credentialsExist: true }), objectApi, _log);
    await identity.ensureTenantCogneeIdentity(_makeTenant("acme"), "default");

    // Exactly one fetch — the liveness login — and NO register call, NO Secret write.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://cognee:8000/api/v1/auth/login");
    expect(objectApi.create as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("re-registers when the existing login no longer authenticates (Cognee identity-store wipe)", async () =>
  {
    // Secret present but the login 401s (its Cognee user was wiped) → re-register + rewrite Secret
    // with tenantId reset to "" so the join step re-runs.
    const seen: string[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      seen.push(url);
      if (url.endsWith("/api/v1/auth/login")) { return new Response("Unauthorized", { status: 401 }); }
      if (url.endsWith("/api/v1/auth/register")) { return new Response("{}", { status: 201 }); }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const objectApi = _makeObjectApi();

    const identity = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi({ credentialsExist: true }), objectApi, _log);
    await identity.ensureTenantCogneeIdentity(_makeTenant("acme"), "default");

    expect(seen).toContain("http://cognee:8000/api/v1/auth/login");
    expect(seen).toContain("http://cognee:8000/api/v1/auth/register");
    expect(objectApi.create as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    const rewritten = (objectApi.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as k8s.V1Secret;
    expect(Buffer.from(rewritten.data!["tenantId"], "base64").toString("utf8")).toBe("");
  });

  it("registers the tenant's owner email and writes a Secret readable by _CredentialsSecretName", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const objectApi = _makeObjectApi();

    const identity = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi(), objectApi, _log);
    await identity.ensureTenantCogneeIdentity(_makeTenant("acme"), "opencrane-elewa");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://cognee:8000/api/v1/auth/register");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["email"]).toBe("acme@example.com");
    expect(typeof body["password"]).toBe("string");
    expect((body["password"] as string).length).toBeGreaterThan(0);
    // Only email/password — Cognee's register endpoint schema is not assumed to accept
    // client-supplied is_active/is_superuser/is_verified fields.
    expect(Object.keys(body).sort()).toEqual(["email", "password"]);

    expect(objectApi.create as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    const created = (objectApi.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as k8s.V1Secret;
    expect(created.metadata?.name).toBe(_CredentialsSecretName("acme"));
    expect(created.metadata?.namespace).toBe("opencrane-elewa");
    expect(Buffer.from(created.data!["username"], "base64").toString("utf8")).toBe("acme@example.com");
    expect(Buffer.from(created.data!["password"], "base64").toString("utf8")).toBe(body["password"]);
  });

  it("derives the SAME password on repeated calls given the same tenant encryption key (crash-safe retry)", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const identity1 = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi(), _makeObjectApi(), _log);
    await identity1.ensureTenantCogneeIdentity(_makeTenant("acme"), "default");
    const password1 = (JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>)["password"];

    fetchMock.mockClear();
    const identity2 = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi(), _makeObjectApi(), _log);
    await identity2.ensureTenantCogneeIdentity(_makeTenant("acme"), "default");
    const password2 = (JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>)["password"];

    expect(password1).toBe(password2);
  });

  it("derives a DIFFERENT password for a different tenant (distinct encryption keys)", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const otherKeyBase64 = Buffer.from("c".repeat(32)).toString("base64");
    const identity1 = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi(), _makeObjectApi(), _log);
    await identity1.ensureTenantCogneeIdentity(_makeTenant("acme"), "default");
    const password1 = (JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>)["password"];

    fetchMock.mockClear();
    const identity2 = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi({ encryptionKeyBase64: otherKeyBase64 }), _makeObjectApi(), _log);
    await identity2.ensureTenantCogneeIdentity(_makeTenant("bcorp"), "default");
    const password2 = (JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>)["password"];

    expect(password1).not.toBe(password2);
  });

  it("treats a 400 register response as already-registered and still writes the Secret", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("REGISTER_USER_ALREADY_EXISTS", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const objectApi = _makeObjectApi();

    const identity = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi(), objectApi, _log);
    await expect(identity.ensureTenantCogneeIdentity(_makeTenant("acme"), "default")).resolves.toBeUndefined();

    expect(objectApi.create as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("throws when registration fails with an unexpected status (not 2xx/400)", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const objectApi = _makeObjectApi();

    const identity = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi(), objectApi, _log);
    await expect(identity.ensureTenantCogneeIdentity(_makeTenant("acme"), "default")).rejects.toThrow(/Cognee user registration failed/);

    expect(objectApi.create as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("throws a clear error when the tenant's encryption key Secret has no key field", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const identity = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi({ encryptionKeyBase64: null }), _makeObjectApi(), _log);
    await expect(identity.ensureTenantCogneeIdentity(_makeTenant("acme"), "default")).rejects.toThrow(/encryption-key/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates the raw error when the tenant's encryption key Secret does not exist at all", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const coreApi = {
      readNamespacedSecret: vi.fn().mockImplementation(function _read({ name }: { name: string }): Promise<k8s.V1Secret>
      {
        if (name.endsWith("-cognee-credentials"))
        {
          return Promise.reject(new Error("404 not found"));
        }

        // encryption-key Secret genuinely missing (e.g. reconciled out of order).
        return Promise.reject(new Error("secrets \"openclaw-acme-encryption-key\" not found"));
      }),
    } as unknown as k8s.CoreV1Api;

    const identity = new CogneeTenantIdentity(_enabledConfig, coreApi, _makeObjectApi(), _log);
    await expect(identity.ensureTenantCogneeIdentity(_makeTenant("acme"), "default")).rejects.toThrow(/encryption-key.*not found/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lowercases/trims the owner email before registering", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const tenant = _makeTenant("acme", { email: "  Acme.Owner@Example.com  " });
    const identity = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi(), _makeObjectApi(), _log);
    await identity.ensureTenantCogneeIdentity(tenant, "default");

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body["email"]).toBe("acme.owner@example.com");
  });
});

/** Decode a stored Secret's field back to a plain string. */
function _field(secret: k8s.V1Secret, key: string): string
{
  return Buffer.from(secret.data![key]!, "base64").toString("utf8");
}

/**
 * A tiny in-memory Secret store shared by a coreApi/objectApi pair, mirroring
 * cognee-silo-tenant.test.ts's helper — needed here because `ensureTenantJoinedToSiloTenant`
 * reads BOTH this tenant's credentials Secret and the silo owner's Secret, and a test needs
 * to observe the write that lands afterward.
 */
function _makeStatefulApis(): { coreApi: k8s.CoreV1Api; objectApi: k8s.KubernetesObjectApi; store: Map<string, k8s.V1Secret> }
{
  const store = new Map<string, k8s.V1Secret>();

  const coreApi = {
    readNamespacedSecret: vi.fn().mockImplementation(function _read({ name, namespace }: { name: string; namespace: string }): Promise<k8s.V1Secret>
    {
      const secret = store.get(`${namespace}/${name}`);
      return secret ? Promise.resolve(secret) : Promise.reject(new Error("404 not found"));
    }),
  } as unknown as k8s.CoreV1Api;

  const objectApi = {
    read: vi.fn().mockImplementation(function _read(resource: k8s.KubernetesObject): Promise<{ body: k8s.V1Secret }>
    {
      const secret = store.get(`${resource.metadata!.namespace}/${resource.metadata!.name}`);
      return secret ? Promise.resolve({ body: secret }) : Promise.reject(new Error("not found"));
    }),
    create: vi.fn().mockImplementation(function _create(resource: k8s.V1Secret): Promise<{ body: k8s.V1Secret }>
    {
      store.set(`${resource.metadata!.namespace}/${resource.metadata!.name}`, resource);
      return Promise.resolve({ body: resource });
    }),
    patch: vi.fn().mockImplementation(function _patch(resource: k8s.V1Secret): Promise<{ body: k8s.V1Secret }>
    {
      store.set(`${resource.metadata!.namespace}/${resource.metadata!.name}`, resource);
      return Promise.resolve({ body: resource });
    }),
  } as unknown as k8s.KubernetesObjectApi;

  return { coreApi, objectApi, store };
}

function _seedCredentials(store: Map<string, k8s.V1Secret>, namespace: string, tenantName: string, opts: { username: string; password: string; tenantId?: string }): void
{
  store.set(`${namespace}/${_CredentialsSecretName(tenantName)}`, {
    metadata: { name: _CredentialsSecretName(tenantName), namespace },
    data: {
      username: Buffer.from(opts.username).toString("base64"),
      password: Buffer.from(opts.password).toString("base64"),
      tenantId: Buffer.from(opts.tenantId ?? "").toString("base64"),
    },
  } as unknown as k8s.V1Secret);
}

function _seedOwner(store: Map<string, k8s.V1Secret>, namespace: string, opts: { username: string; password: string; tenantId?: string }): void
{
  store.set(`${namespace}/cognee-silo-owner`, {
    metadata: { name: "cognee-silo-owner", namespace },
    data: {
      username: Buffer.from(opts.username).toString("base64"),
      password: Buffer.from(opts.password).toString("base64"),
      tenantId: Buffer.from(opts.tenantId ?? "").toString("base64"),
    },
  } as unknown as k8s.V1Secret);
}

describe("CogneeTenantIdentity.ensureTenantJoinedToSiloTenant", () =>
{
  beforeEach(() =>
  {
    vi.restoreAllMocks();
  });

  afterEach(() =>
  {
    vi.unstubAllGlobals();
  });

  it("is a no-op when Cognee is not configured", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi } = _makeStatefulApis();

    await new CogneeTenantIdentity(defaultConfig, coreApi, objectApi, _log).ensureTenantJoinedToSiloTenant(_makeTenant("acme"), "default");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-ops when this tenant has no Cognee credentials yet", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi } = _makeStatefulApis();

    await new CogneeTenantIdentity(_enabledConfig, coreApi, objectApi, _log).ensureTenantJoinedToSiloTenant(_makeTenant("acme"), "default");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-ops when already joined to the CURRENT silo tenant (cached id matches the owner's)", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeStatefulApis();
    _seedCredentials(store, "default", "acme", { username: "acme@example.com", password: "pw", tenantId: "tenant-1" });
    _seedOwner(store, "default", { username: "owner@x", password: "owner-pw", tenantId: "tenant-1" });

    await new CogneeTenantIdentity(_enabledConfig, coreApi, objectApi, _log).ensureTenantJoinedToSiloTenant(_makeTenant("acme"), "default");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-joins when the cached tenant id no longer matches the current silo tenant (silo re-provisioned)", async () =>
  {
    // The silo owner's Cognee Tenant was re-created with a NEW id (CogneeSiloTenant self-heal after
    // an identity-store reset); the cached membership is stale → the login must re-join + re-select.
    const seen: string[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      seen.push(url);
      if (url.endsWith("/auth/login")) { return new Response(JSON.stringify({ access_token: "jwt" }), { status: 200 }); }
      if (url.endsWith("/api/v1/users/get-user-id")) { return new Response(JSON.stringify({ user_id: "u1" }), { status: 200 }); }
      if (url.includes("/tenants?tenant_id=tenant-NEW")) { return new Response("{}", { status: 200 }); }
      if (url.endsWith("/api/v1/permissions/tenants/select")) { return new Response("{}", { status: 200 }); }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeStatefulApis();
    _seedCredentials(store, "default", "acme", { username: "acme@example.com", password: "tenant-pw", tenantId: "tenant-OLD" });
    _seedOwner(store, "default", { username: "owner@x", password: "owner-pw", tenantId: "tenant-NEW" });

    await new CogneeTenantIdentity(_enabledConfig, coreApi, objectApi, _log).ensureTenantJoinedToSiloTenant(_makeTenant("acme"), "default");

    expect(seen.some(u => u.includes("/tenants?tenant_id=tenant-NEW"))).toBe(true);
    expect(_field(store.get("default/" + _CredentialsSecretName("acme"))!, "tenantId")).toBe("tenant-NEW");
  });

  it("no-ops (retried later) when the silo owner's Cognee Tenant isn't resolved yet", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeStatefulApis();
    _seedCredentials(store, "default", "acme", { username: "acme@example.com", password: "pw" });
    // Owner Secret doesn't exist at all — CogneeSiloTenant hasn't run yet.

    await new CogneeTenantIdentity(_enabledConfig, coreApi, objectApi, _log).ensureTenantJoinedToSiloTenant(_makeTenant("acme"), "default");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs in as owner, resolves the user id, joins the tenant, then selects it as the user's active tenant", async () =>
  {
    const calls: string[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) =>
    {
      calls.push(url);
      if (url.endsWith("/auth/login"))
      {
        const body = new URLSearchParams(init!.body as string);
        const token = body.get("username") === "silo-owner@opencrane.internal" ? "jwt-owner" : "jwt-user";
        return new Response(JSON.stringify({ access_token: token }), { status: 200 });
      }
      if (url.endsWith("/api/v1/users/get-user-id"))
      {
        expect(init!.headers).toMatchObject({ Authorization: "Bearer jwt-owner" });
        return new Response(JSON.stringify({ user_id: "user-uuid-acme" }), { status: 200 });
      }
      if (url.includes("/api/v1/permissions/users/user-uuid-acme/tenants"))
      {
        expect(url).toContain("tenant_id=tenant-silo-1");
        expect(init!.headers).toMatchObject({ Authorization: "Bearer jwt-owner" });
        return new Response("{}", { status: 200 });
      }
      if (url.endsWith("/api/v1/permissions/tenants/select"))
      {
        expect(init!.headers).toMatchObject({ Authorization: "Bearer jwt-user" });
        expect(JSON.parse(init!.body as string)).toEqual({ tenant_id: "tenant-silo-1" });
        return new Response("{}", { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeStatefulApis();
    _seedCredentials(store, "opencrane-elewa", "acme", { username: "acme@example.com", password: "tenant-pw" });
    _seedOwner(store, "opencrane-elewa", { username: "silo-owner@opencrane.internal", password: "owner-pw", tenantId: "tenant-silo-1" });

    await new CogneeTenantIdentity(_enabledConfig, coreApi, objectApi, _log).ensureTenantJoinedToSiloTenant(_makeTenant("acme"), "opencrane-elewa");

    expect(calls).toEqual([
      "http://cognee:8000/api/v1/auth/login",
      "http://cognee:8000/api/v1/users/get-user-id",
      "http://cognee:8000/api/v1/permissions/users/user-uuid-acme/tenants?tenant_id=tenant-silo-1",
      "http://cognee:8000/api/v1/auth/login",
      "http://cognee:8000/api/v1/permissions/tenants/select",
    ]);
    expect(_field(store.get("opencrane-elewa/" + _CredentialsSecretName("acme"))!, "tenantId")).toBe("tenant-silo-1");
  });

  it("tolerates a 409 (already a member) when adding the user to the tenant", async () =>
  {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      if (url.endsWith("/auth/login")) return new Response(JSON.stringify({ access_token: "jwt" }), { status: 200 });
      if (url.endsWith("/api/v1/users/get-user-id")) return new Response(JSON.stringify({ user_id: "user-uuid" }), { status: 200 });
      if (url.includes("/tenants?tenant_id=")) return new Response("already a member", { status: 409 });
      if (url.endsWith("/api/v1/permissions/tenants/select")) return new Response("{}", { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeStatefulApis();
    _seedCredentials(store, "default", "acme", { username: "acme@example.com", password: "tenant-pw" });
    _seedOwner(store, "default", { username: "owner@x", password: "owner-pw", tenantId: "tenant-1" });

    await expect(new CogneeTenantIdentity(_enabledConfig, coreApi, objectApi, _log).ensureTenantJoinedToSiloTenant(_makeTenant("acme"), "default"))
      .resolves.toBeUndefined();
    expect(_field(store.get("default/" + _CredentialsSecretName("acme"))!, "tenantId")).toBe("tenant-1");
  });

  it("throws when the user-id lookup fails", async () =>
  {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      if (url.endsWith("/auth/login")) return new Response(JSON.stringify({ access_token: "jwt" }), { status: 200 });
      if (url.endsWith("/api/v1/users/get-user-id")) return new Response("not found", { status: 404 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeStatefulApis();
    _seedCredentials(store, "default", "acme", { username: "acme@example.com", password: "tenant-pw" });
    _seedOwner(store, "default", { username: "owner@x", password: "owner-pw", tenantId: "tenant-1" });

    await expect(new CogneeTenantIdentity(_enabledConfig, coreApi, objectApi, _log).ensureTenantJoinedToSiloTenant(_makeTenant("acme"), "default"))
      .rejects.toThrow(/Cognee get-user-id failed/);
  });
});

describe("CogneeTenantIdentity.currentJoinedTenantId", () =>
{
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns the cached joined tenant id (the pod roll-stamp) when present", async () =>
  {
    const { coreApi, objectApi, store } = _makeStatefulApis();
    _seedCredentials(store, "default", "acme", { username: "acme@example.com", password: "pw", tenantId: "tenant-live-7" });

    const id = await new CogneeTenantIdentity(_enabledConfig, coreApi, objectApi, _log).currentJoinedTenantId("acme", "default");
    expect(id).toBe("tenant-live-7");
  });

  it("returns empty string when not joined yet (tenantId empty) or no credentials Secret", async () =>
  {
    const { coreApi, objectApi, store } = _makeStatefulApis();
    _seedCredentials(store, "default", "acme", { username: "acme@example.com", password: "pw" }); // tenantId defaults to ""

    const identity = new CogneeTenantIdentity(_enabledConfig, coreApi, objectApi, _log);
    expect(await identity.currentJoinedTenantId("acme", "default")).toBe("");
    // No credentials Secret at all → also empty (never throws).
    expect(await identity.currentJoinedTenantId("nonexistent", "default")).toBe("");
  });
});
