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

  it("no-ops when the tenant's cognee-credentials Secret already exists (never rotated)", async () =>
  {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const objectApi = _makeObjectApi();

    const identity = new CogneeTenantIdentity(_enabledConfig, _makeCoreApi({ credentialsExist: true }), objectApi, _log);
    await identity.ensureTenantCogneeIdentity(_makeTenant("acme"), "default");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(objectApi.create as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
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
