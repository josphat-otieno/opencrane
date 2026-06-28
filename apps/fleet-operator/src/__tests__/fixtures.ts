import type { ClusterTenantResource } from "@opencrane/infra-api";

import type { FleetOperatorConfig } from "../config.js";

/**
 * Shared fleet operator config fixture. The fleet's only reconcile loop is the
 * ClusterTenantOperator, so the config it needs is the small four-field
 * {@link FleetOperatorConfig} (the full 400-line operator config moved to the
 * silo with the in-silo controllers in Stage 5).
 */
export const defaultConfig: FleetOperatorConfig = {
  ingressDomain: "opencrane.local",
  ingressIp: "",
  certManagerIssuerName: "opencrane-issuer",
  certManagerIssuerKind: "ClusterIssuer",
};

/**
 * Create a minimal ClusterTenant fixture (operator-local view) with the given
 * name and bound namespace for use in cluster-tenant reconcile tests.
 */
export function _makeClusterTenant(name: string, boundNamespace?: string): ClusterTenantResource
{
  return {
    apiVersion: "opencrane.io/v1alpha1",
    kind: "ClusterTenant",
    metadata: { name },
    spec: {
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      isolationTier: "shared",
      compute: { mode: "shared" },
      resources: { quota: { cpu: "4", memory: "8Gi", pods: 10 } },
    },
    status: boundNamespace ? { phase: "ready", boundNamespace } : undefined,
  };
}
