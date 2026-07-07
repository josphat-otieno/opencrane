import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as k8s from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";

/**
 * Guards the ClusterTenant CRD's structural schema against field pruning. A Kubernetes
 * structural schema (no spec-level `x-kubernetes-preserve-unknown-fields`) PRUNES any field
 * the schema does not declare on write, silently. Both the fleet CR bridge (writes
 * `spec.zitadel`) and the silo login resolver (reads `spec.zitadel`) depend on the per-org
 * Zitadel OIDC ids surviving on the CR; if the schema drops `zitadel`, per-org login degrades
 * to the shared masters client with no error. This asserts the field is declared so that
 * regression cannot recur.
 */
const _CRD_PATH = fileURLToPath(new URL("../../../../fleet-platform/crds/opencrane.io_clustertenants.yaml", import.meta.url));

interface _CrdSchemaProps
{
  type?: string;
  properties?: Record<string, _CrdSchemaProps>;
  "x-kubernetes-preserve-unknown-fields"?: boolean;
}

function _loadClusterTenantSpecSchema(): _CrdSchemaProps
{
  const crd = k8s.loadYaml(readFileSync(_CRD_PATH, "utf8")) as {
    spec: { versions: Array<{ schema: { openAPIV3Schema: _CrdSchemaProps } }> };
  };
  const root = crd.spec.versions[0].schema.openAPIV3Schema;
  const spec = root.properties?.spec;
  if (!spec) throw new Error("ClusterTenant CRD has no spec schema");
  return spec;
}

describe("ClusterTenant CRD structural schema", function _suite()
{
  it("declares spec.zitadel with the OIDC ids the CR bridge writes and the silo login reads", function ()
  {
    const spec = _loadClusterTenantSpecSchema();

    // A structural schema (no spec-level preserve-unknown) prunes undeclared fields, so the
    // whole zitadel block must be declared or the API server drops it on the bridge's write.
    expect(spec["x-kubernetes-preserve-unknown-fields"]).toBeUndefined();

    const zitadel = spec.properties?.zitadel;
    expect(zitadel, "spec.zitadel must be declared or the API server prunes per-org OIDC ids").toBeDefined();
    expect(zitadel?.type).toBe("object");

    for (const field of ["clientId", "orgId", "redirectUri"])
    {
      expect(zitadel?.properties?.[field]?.type, `spec.zitadel.${field} must be a declared string`).toBe("string");
    }
  });
});
