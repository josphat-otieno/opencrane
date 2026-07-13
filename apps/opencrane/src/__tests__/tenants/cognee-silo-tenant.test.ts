import { Buffer } from "node:buffer";

import * as k8s from "@kubernetes/client-node";
import pino from "pino";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { defaultConfig } from "../fixtures.js";
import { CogneeSiloTenant, COGNEE_SILO_OWNER_SECRET_NAME } from "../../reconcilers/tenants/internal/cognee-silo-tenant.js";
import type { OpenClawTenantOperatorConfig } from "../../app/config.js";

const _log = pino({ level: "silent" });

const _enabledConfig: OpenClawTenantOperatorConfig = {
  ...defaultConfig,
  cogneeEndpoint: "http://cognee:8000",
};

/**
 * A tiny in-memory Secret store shared by a coreApi/objectApi pair, so a test can observe
 * the two-phase write (durable password persisted BEFORE the register/login/create calls)
 * exactly as the real cluster would: a write via objectApi.create is visible to a
 * subsequent coreApi.readNamespacedSecret in the SAME test.
 */
function _makeApis(): { coreApi: k8s.CoreV1Api; objectApi: k8s.KubernetesObjectApi; store: Map<string, k8s.V1Secret> }
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

/** Decode a stored Secret's field back to a plain string. */
function _field(secret: k8s.V1Secret, key: string): string
{
  return Buffer.from(secret.data![key]!, "base64").toString("utf8");
}

describe("CogneeSiloTenant", () =>
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
    const { coreApi, objectApi } = _makeApis();

    await new CogneeSiloTenant(defaultConfig, coreApi, objectApi, _log).ensureSiloTenant("acme", "default");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists the owner credential BEFORE any external call (durable phase 1), then registers/logs in/creates the tenant", async () =>
  {
    let secretAtRegisterTime: k8s.V1Secret | undefined;
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      if (url.endsWith("/auth/register"))
      {
        // The credential must already be durably persisted by the time we register.
        secretAtRegisterTime = store.get("opencrane-elewa/cognee-silo-owner");
        return new Response("{}", { status: 201 });
      }
      if (url.endsWith("/auth/login"))
      {
        return new Response(JSON.stringify({ access_token: "jwt-owner" }), { status: 200 });
      }
      if (url.endsWith("/api/v1/permissions/tenants/me"))
      {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/api/v1/permissions/tenants?tenant_name="))
      {
        return new Response(JSON.stringify({ tenant_id: "tenant-123" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeApis();

    await new CogneeSiloTenant(_enabledConfig, coreApi, objectApi, _log).ensureSiloTenant("elewa", "opencrane-elewa");

    expect(secretAtRegisterTime).toBeDefined();
    expect(_field(secretAtRegisterTime!, "username")).toBe("silo-owner@opencrane.internal");
    expect(_field(secretAtRegisterTime!, "password").length).toBeGreaterThan(0);
    expect(_field(secretAtRegisterTime!, "tenantId")).toBe("");

    const final = store.get("opencrane-elewa/cognee-silo-owner")!;
    expect(_field(final, "tenantId")).toBe("tenant-123");
  });

  it("skips re-provisioning when the resolved owner/tenant is still live (liveness-checked, not just Secret-gated)", async () =>
  {
    // tenantId cached AND the owner still logs in AND tenants/me still returns it → converged:
    // only the liveness probe (login + tenants/me) fires, no register / no tenant create.
    const seen: string[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      seen.push(url);
      if (url.endsWith("/auth/login")) { return new Response(JSON.stringify({ access_token: "jwt-owner" }), { status: 200 }); }
      if (url.endsWith("/api/v1/permissions/tenants/me")) { return new Response(JSON.stringify([{ id: "tenant-already-resolved" }]), { status: 200 }); }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeApis();
    store.set("default/cognee-silo-owner", {
      metadata: { name: COGNEE_SILO_OWNER_SECRET_NAME, namespace: "default" },
      data: {
        username: Buffer.from("silo-owner@opencrane.internal").toString("base64"),
        password: Buffer.from("existing-pass").toString("base64"),
        tenantId: Buffer.from("tenant-already-resolved").toString("base64"),
      },
    } as unknown as k8s.V1Secret);

    await new CogneeSiloTenant(_enabledConfig, coreApi, objectApi, _log).ensureSiloTenant("acme", "default");

    expect(seen).toEqual(["http://cognee:8000/api/v1/auth/login", "http://cognee:8000/api/v1/permissions/tenants/me"]);
    expect(_field(store.get("default/cognee-silo-owner")!, "tenantId")).toBe("tenant-already-resolved");
  });

  it("re-provisions when the resolved owner/tenant is no longer live (Cognee identity-store reset)", async () =>
  {
    // tenantId cached but the owner login 401s (its Cognee user was wiped) → re-register the owner,
    // re-create the tenant (tenants/me now empty), and rewrite the Secret with the NEW id.
    let ownerRegistered = false;
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      if (url.endsWith("/auth/register")) { ownerRegistered = true; return new Response("{}", { status: 201 }); }
      if (url.endsWith("/auth/login"))
      {
        // 401 until the owner is (re)registered, 200 after — models the wiped-then-restored user.
        return ownerRegistered
          ? new Response(JSON.stringify({ access_token: "jwt-owner" }), { status: 200 })
          : new Response("Unauthorized", { status: 401 });
      }
      if (url.endsWith("/api/v1/permissions/tenants/me")) { return new Response(JSON.stringify([]), { status: 200 }); }
      if (url.includes("/api/v1/permissions/tenants?tenant_name=")) { return new Response(JSON.stringify({ tenant_id: "tenant-REPROVISIONED" }), { status: 200 }); }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeApis();
    store.set("default/cognee-silo-owner", {
      metadata: { name: COGNEE_SILO_OWNER_SECRET_NAME, namespace: "default" },
      data: {
        username: Buffer.from("silo-owner@opencrane.internal").toString("base64"),
        password: Buffer.from("existing-pass").toString("base64"),
        tenantId: Buffer.from("tenant-STALE").toString("base64"),
      },
    } as unknown as k8s.V1Secret);

    await new CogneeSiloTenant(_enabledConfig, coreApi, objectApi, _log).ensureSiloTenant("acme", "default");

    expect(ownerRegistered).toBe(true);
    expect(_field(store.get("default/cognee-silo-owner")!, "tenantId")).toBe("tenant-REPROVISIONED");
  });

  it("resumes phase 2 with the SAME persisted password after a simulated crash (tenantId empty but credential exists)", async () =>
  {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) =>
    {
      if (url.endsWith("/auth/register"))
      {
        const body = JSON.parse(init!.body as string) as Record<string, string>;
        expect(body.password).toBe("already-persisted-password");
        return new Response("{}", { status: 201 });
      }
      if (url.endsWith("/auth/login"))
      {
        return new Response(JSON.stringify({ access_token: "jwt-owner" }), { status: 200 });
      }
      if (url.endsWith("/api/v1/permissions/tenants/me"))
      {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/api/v1/permissions/tenants?tenant_name="))
      {
        return new Response(JSON.stringify({ tenant_id: "tenant-456" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeApis();
    store.set("default/cognee-silo-owner", {
      metadata: { name: COGNEE_SILO_OWNER_SECRET_NAME, namespace: "default" },
      data: {
        username: Buffer.from("silo-owner@opencrane.internal").toString("base64"),
        password: Buffer.from("already-persisted-password").toString("base64"),
        tenantId: Buffer.from("").toString("base64"),
      },
    } as unknown as k8s.V1Secret);

    await new CogneeSiloTenant(_enabledConfig, coreApi, objectApi, _log).ensureSiloTenant("acme", "default");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(_field(store.get("default/cognee-silo-owner")!, "tenantId")).toBe("tenant-456");
  });

  it("reuses an existing Cognee Tenant found via tenants/me instead of creating a new one", async () =>
  {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      if (url.endsWith("/auth/register")) return new Response("{}", { status: 201 });
      if (url.endsWith("/auth/login")) return new Response(JSON.stringify({ access_token: "jwt-owner" }), { status: 200 });
      if (url.endsWith("/api/v1/permissions/tenants/me"))
      {
        return new Response(JSON.stringify([{ id: "existing-tenant-id", name: "acme" }]), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url} (should not create — tenants/me already returned one)`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeApis();

    await new CogneeSiloTenant(_enabledConfig, coreApi, objectApi, _log).ensureSiloTenant("acme", "default");

    expect(_field(store.get("default/cognee-silo-owner")!, "tenantId")).toBe("existing-tenant-id");
  });

  it("treats a 400 on register as already-registered and proceeds", async () =>
  {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      if (url.endsWith("/auth/register")) return new Response("already exists", { status: 400 });
      if (url.endsWith("/auth/login")) return new Response(JSON.stringify({ access_token: "jwt-owner" }), { status: 200 });
      if (url.endsWith("/api/v1/permissions/tenants/me")) return new Response(JSON.stringify([{ id: "t1", name: "acme" }]), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeApis();

    await expect(new CogneeSiloTenant(_enabledConfig, coreApi, objectApi, _log).ensureSiloTenant("acme", "default")).resolves.toBeUndefined();
    expect(_field(store.get("default/cognee-silo-owner")!, "tenantId")).toBe("t1");
  });

  it("retries tenants/me once after a 409 on create (lost a race) instead of failing", async () =>
  {
    let mineCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      if (url.endsWith("/auth/register")) return new Response("{}", { status: 201 });
      if (url.endsWith("/auth/login")) return new Response(JSON.stringify({ access_token: "jwt-owner" }), { status: 200 });
      if (url.endsWith("/api/v1/permissions/tenants/me"))
      {
        mineCallCount += 1;
        // First check: empty (about to create). Second check (after the 409): resolved.
        return new Response(JSON.stringify(mineCallCount === 1 ? [] : [{ id: "t-race", name: "acme" }]), { status: 200 });
      }
      if (url.includes("/api/v1/permissions/tenants?tenant_name=")) return new Response("conflict", { status: 409 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi, store } = _makeApis();

    await new CogneeSiloTenant(_enabledConfig, coreApi, objectApi, _log).ensureSiloTenant("acme", "default");

    expect(mineCallCount).toBe(2);
    expect(_field(store.get("default/cognee-silo-owner")!, "tenantId")).toBe("t-race");
  });

  it("throws when registration fails with an unexpected status", async () =>
  {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi } = _makeApis();

    await expect(new CogneeSiloTenant(_enabledConfig, coreApi, objectApi, _log).ensureSiloTenant("acme", "default"))
      .rejects.toThrow(/Cognee silo-owner registration failed/);
  });

  it("throws when login fails", async () =>
  {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
    {
      if (url.endsWith("/auth/register")) return new Response("{}", { status: 201 });
      return new Response("bad credentials", { status: 400 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { coreApi, objectApi } = _makeApis();

    await expect(new CogneeSiloTenant(_enabledConfig, coreApi, objectApi, _log).ensureSiloTenant("acme", "default"))
      .rejects.toThrow(/Cognee silo-owner login failed/);
  });
});
