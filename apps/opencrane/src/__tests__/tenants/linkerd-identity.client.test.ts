import type * as k8s from "@kubernetes/client-node";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";

import { _BuildSiloLinkerdIdentityPolicy } from "../../reconcilers/tenants/deploy/silo-linkerd-identity.js";
import { LinkerdIdentityClient } from "../../reconcilers/tenants/internal/linkerd-identity.client.js";
import { defaultConfig } from "../fixtures.js";

/** A 404 the API server returns when a Linkerd policy CRD type is NOT served (Linkerd absent). */
const _CRD_ABSENT = Object.assign(new Error("the server could not find the requested resource"), { code: 404, body: { message: "the server could not find the requested resource" } });
/** A 404 the API server returns when the TARGET NAMESPACE is missing (CRDs present). */
const _NAMESPACE_MISSING = Object.assign(new Error("namespaces \"opencrane-acme\" not found"), { code: 404, body: { reason: "NotFound", message: "namespaces \"opencrane-acme\" not found", details: { kind: "namespaces", name: "opencrane-acme" } } });
/** A 409 error matching the client's conflict shape. */
const _CONFLICT = Object.assign(new Error("already exists"), { code: 409 });

/** No-op logger so the fail-closed warn path is exercised without console noise. */
const _LOG = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger;

/** A representative bundle for the silo `opencrane-acme`. */
const _BUNDLE = _BuildSiloLinkerdIdentityPolicy("opencrane-acme", "acme", { ...defaultConfig, operatorNamespace: "opencrane-system" });

describe("LinkerdIdentityClient — silo identity policy apply (fail-closed on absent Linkerd)", function _suite()
{
  it("creates all three policy objects as namespaced custom objects (Server, MeshTLS, AuthzPolicy)", async function _create()
  {
    const createNamespacedCustomObject = vi.fn().mockResolvedValue({});
    const customApi = { createNamespacedCustomObject } as unknown as k8s.CustomObjectsApi;

    const result = await new LinkerdIdentityClient(customApi, _LOG).applySiloIdentityPolicy("opencrane-acme", _BUNDLE);

    expect(result).toEqual({ applied: true });
    expect(createNamespacedCustomObject).toHaveBeenCalledTimes(3);
    const plurals = createNamespacedCustomObject.mock.calls.map(c => c[0].plural);
    expect(plurals).toEqual(["servers", "meshtlsauthentications", "authorizationpolicies"]);
  });

  it("gates applied:false when a Linkerd policy CRD is absent (unserved-type 404) — never throws", async function _crdAbsent()
  {
    const createNamespacedCustomObject = vi.fn().mockRejectedValue(_CRD_ABSENT);
    const customApi = { createNamespacedCustomObject } as unknown as k8s.CustomObjectsApi;

    const result = await new LinkerdIdentityClient(customApi, _LOG).applySiloIdentityPolicy("opencrane-acme", _BUNDLE);

    // First object's absent CRD short-circuits the whole bundle (no partial apply).
    expect(result.applied).toBe(false);
    expect(createNamespacedCustomObject).toHaveBeenCalledOnce();
  });

  it("RE-THROWS a namespace-missing 404 rather than misattributing it as Linkerd-absent", async function _namespaceMissing()
  {
    const createNamespacedCustomObject = vi.fn().mockRejectedValue(_NAMESPACE_MISSING);
    const customApi = { createNamespacedCustomObject } as unknown as k8s.CustomObjectsApi;

    await expect(new LinkerdIdentityClient(customApi, _LOG).applySiloIdentityPolicy("opencrane-acme", _BUNDLE)).rejects.toThrow(/not found/);
  });

  it("replaces on 409 carrying the live resourceVersion (idempotent re-apply)", async function _conflict()
  {
    const createNamespacedCustomObject = vi.fn().mockRejectedValue(_CONFLICT);
    const getNamespacedCustomObject = vi.fn().mockResolvedValue({ metadata: { resourceVersion: "42" } });
    const replaceNamespacedCustomObject = vi.fn().mockResolvedValue({});
    const customApi = { createNamespacedCustomObject, getNamespacedCustomObject, replaceNamespacedCustomObject } as unknown as k8s.CustomObjectsApi;

    const result = await new LinkerdIdentityClient(customApi, _LOG).applySiloIdentityPolicy("opencrane-acme", _BUNDLE);

    expect(result).toEqual({ applied: true });
    expect(replaceNamespacedCustomObject).toHaveBeenCalledTimes(3);
    const body = replaceNamespacedCustomObject.mock.calls[0][0].body as { metadata: { resourceVersion?: string } };
    expect(body.metadata.resourceVersion).toBe("42");
  });
});
