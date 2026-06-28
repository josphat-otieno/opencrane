import type { OpenClawTenantOperatorConfig } from "../../config.js";

import type {
  LinkerdAuthorizationPolicy,
  LinkerdMeshTlsAuthentication,
  LinkerdServer,
  SiloLinkerdIdentityPolicy,
} from "./silo-linkerd-identity.types.js";

/**
 * Trust domain suffix of a Linkerd mesh ServiceAccount identity. A meshed pod's mTLS
 * identity is `<serviceaccount>.<namespace>.serviceaccount.identity.linkerd.cluster.local`;
 * `*.<namespace>.<this suffix>` therefore matches every ServiceAccount in a namespace.
 */
const _LINKERD_IDENTITY_SUFFIX = "serviceaccount.identity.linkerd.cluster.local";

/**
 * Wildcard mesh-identity string matching every ServiceAccount in a namespace.
 *
 * @param namespace - The namespace whose meshed identities should be matched.
 * @returns A `*.<namespace>.serviceaccount.identity.linkerd.cluster.local` identity.
 */
function _meshIdentityForNamespace(namespace: string): string
{
  return `*.${namespace}.${_LINKERD_IDENTITY_SUFFIX}`;
}

/**
 * Build the per-silo Linkerd identity policy bundle — the meshed (mTLS-identity) analogue
 * of the S2 default-deny baseline NetworkPolicy (S5 — Linkerd identity substrate, ADR 0001).
 *
 * ADR 0001 layers Linkerd ADDITIVELY on top of the Dataplane-V2/Cilium L3/4 floor: the S2
 * `_BuildSiloBaselineNetworkPolicy` closes the silo edge at L3/4, and this closes it again at
 * the identity layer, so a silo is isolated both by namespace network reachability AND by
 * cryptographic workload identity. The bundle mirrors the S2 posture exactly:
 *
 * - **Server** (`policy.linkerd.io/v1beta1`): empty `podSelector` selects EVERY pod in the
 *   silo namespace and `accessPolicy: deny` flips them to default-deny — the identity-layer
 *   equivalent of the S2 NetworkPolicy's empty `podSelector` + `Ingress`/`Egress` default-deny.
 * - **MeshTLSAuthentication** (`policy.linkerd.io/v1alpha1`): the allow-list of mesh identities,
 *   set to the silo's OWN ServiceAccount identity domain (intra-silo) and the operator/
 *   control-plane namespace's (the only cross-silo principal) — exactly the S2 ingress
 *   allow-list (`{ podSelector: {} }` + the operator-namespace selector). No OTHER silo's
 *   identity is ever listed, so no cross-silo path is created at the identity layer either.
 * - **AuthorizationPolicy** (`policy.linkerd.io/v1alpha1`): binds the deny-by-default Server to
 *   that authentication, re-opening only intra-silo + operator-namespace meshed traffic.
 *
 * Emitted as untyped custom objects by the caller (the operator has no generated client model
 * for Linkerd CRDs); this builder is pure so it is covered by the same kind of unit test as
 * `_BuildSiloBaselineNetworkPolicy`. Gated OFF by default at the call site
 * ({@link OpenClawTenantOperatorConfig.linkerdMeshEnabled}) so a cluster without Linkerd installed
 * is wholly unaffected — the objects are only applied when the operator is told the mesh exists.
 *
 * @param namespace - The silo (ClusterTenant) namespace the objects are created in.
 * @param clusterTenantName - Parent ClusterTenant name, recorded in names + labels.
 * @param config - Operator config; supplies the control-plane/operator namespace.
 * @returns The Server + MeshTLSAuthentication + AuthorizationPolicy bundle for the silo.
 */
export function _BuildSiloLinkerdIdentityPolicy(
  namespace: string,
  clusterTenantName: string,
  config: OpenClawTenantOperatorConfig,
): SiloLinkerdIdentityPolicy
{
  // 1. Resolve the shared-plane namespace — the operator/control-plane is the only
  //    cross-silo principal, so it is the one foreign identity domain the silo admits
  //    (matching the operator-namespace selector in the S2 baseline ingress rule).
  const platformNamespace = config.operatorNamespace;

  // 2. Deterministic, namespace-scoped object names so re-applies converge (idempotent)
  //    and never collide with another silo's bundle.
  const serverName = `opencrane-${clusterTenantName}-silo-identity`;
  const authName = `opencrane-${clusterTenantName}-silo-identity`;
  const authzName = `opencrane-${clusterTenantName}-silo-identity`;

  // 3. Provenance/ownership labels mirroring the S2 baseline NetworkPolicy so both
  //    isolation layers are discoverable under the same `silo-isolation` component.
  const labels = {
    "app.kubernetes.io/part-of": "opencrane",
    "app.kubernetes.io/managed-by": "opencrane-fleet-manager",
    "app.kubernetes.io/component": "silo-isolation",
    "opencrane.io/cluster-tenant": clusterTenantName,
  };

  // 4. The deny-by-default Server over every pod in the silo namespace.
  const server: LinkerdServer = {
    apiVersion: "policy.linkerd.io/v1beta1",
    kind: "Server",
    metadata: { name: serverName, namespace, labels },
    spec: {
      // Empty selector → every pod in the silo namespace (default-deny baseline).
      podSelector: {},
      // The OpenClaw gateway listens here; the meshed proxy governs this inbound port.
      port: config.gatewayPort,
      accessPolicy: "deny",
    },
  };

  // 5. The mesh-identity allow-list: intra-silo + the operator/control-plane plane only.
  const meshTlsAuthentication: LinkerdMeshTlsAuthentication = {
    apiVersion: "policy.linkerd.io/v1alpha1",
    kind: "MeshTLSAuthentication",
    metadata: { name: authName, namespace, labels },
    spec: {
      identities: [
        // Intra-silo: every ServiceAccount in this same namespace.
        _meshIdentityForNamespace(namespace),
        // The control-plane/operator super-admin plane (the only cross-silo principal).
        _meshIdentityForNamespace(platformNamespace),
      ],
    },
  };

  // 6. Bind the deny-by-default Server to the allow-list — the single rule that re-opens
  //    intra-silo + operator-namespace meshed traffic at the identity layer.
  const authorizationPolicy: LinkerdAuthorizationPolicy = {
    apiVersion: "policy.linkerd.io/v1alpha1",
    kind: "AuthorizationPolicy",
    metadata: { name: authzName, namespace, labels },
    spec: {
      targetRef: { group: "policy.linkerd.io", kind: "Server", name: serverName },
      requiredAuthenticationRefs: [
        { group: "policy.linkerd.io", kind: "MeshTLSAuthentication", name: authName },
      ],
    },
  };

  return { server, meshTlsAuthentication, authorizationPolicy };
}
