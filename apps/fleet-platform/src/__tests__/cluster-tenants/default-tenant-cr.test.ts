import type * as k8s from "@kubernetes/client-node";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";

import { _EnsureOwnerDefaultTenantCr } from "../../cluster-tenants/internal/default-tenant-cr.js";

const _log = pino({ enabled: false });

/** A CustomObjectsApi stub whose createNamespacedCustomObject behaves per `create`. */
function _api(create: ReturnType<typeof vi.fn>): k8s.CustomObjectsApi
{
  return { createNamespacedCustomObject: create } as unknown as k8s.CustomObjectsApi;
}

describe("_EnsureOwnerDefaultTenantCr — fleet seeds the owner's default Tenant CRD (Option A)", function _suite()
{
  it("creates the <org>-default Tenant CRD in the bound namespace, attributed to the owner", async function _seeds()
  {
    const create = vi.fn().mockResolvedValue({});
    await _EnsureOwnerDefaultTenantCr({
      customApi: _api(create), log: _log,
      namespace: "opencrane-acme", orgName: "acme", orgDisplayName: "Acme Corp",
      owner: { subject: "owner-sub", email: "owner@acme.com" },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0].body as { metadata: { name: string; namespace: string }; spec: Record<string, unknown> };
    expect(body.metadata).toMatchObject({ name: "acme-default", namespace: "opencrane-acme" });
    expect(body.spec).toMatchObject({ displayName: "Acme Corp workspace", email: "owner@acme.com", clusterTenantRef: "acme", subject: "owner-sub" });
  });

  it("skips (no create) when the owner has no email — the contract cannot compile", async function _noEmail()
  {
    const create = vi.fn().mockResolvedValue({});
    await _EnsureOwnerDefaultTenantCr({
      customApi: _api(create), log: _log,
      namespace: "opencrane-acme", orgName: "acme", orgDisplayName: "Acme Corp",
      owner: { subject: "owner-sub" },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("is idempotent: tolerates a 409 AlreadyExists without throwing", async function _conflict()
  {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("exists"), { code: 409 }));
    await expect(_EnsureOwnerDefaultTenantCr({
      customApi: _api(create), log: _log,
      namespace: "opencrane-acme", orgName: "acme", orgDisplayName: "Acme Corp",
      owner: { subject: "owner-sub", email: "owner@acme.com" },
    })).resolves.toBeUndefined();
  });

  it("swallows a create failure (org is already ready) without throwing", async function _failSoft()
  {
    const create = vi.fn().mockRejectedValue(new Error("api server down"));
    await expect(_EnsureOwnerDefaultTenantCr({
      customApi: _api(create), log: _log,
      namespace: "opencrane-acme", orgName: "acme", orgDisplayName: "Acme Corp",
      owner: { subject: "owner-sub", email: "owner@acme.com" },
    })).resolves.toBeUndefined();
  });
});
