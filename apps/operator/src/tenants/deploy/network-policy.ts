import * as k8s from "@kubernetes/client-node";

import type { OpenClawTenantOperatorConfig } from "../../config.js";
import type { Tenant } from "../models/tenant.interface.js";
import { _BuildTenantLabels } from "./tenant-labels.js";

/** Namespace label every Kubernetes namespace carries (`kubernetes.io/metadata.name`). */
const _NAMESPACE_NAME_LABEL = "kubernetes.io/metadata.name";

/**
 * Build the NetworkPolicy that locks a tenant pod's OpenClaw gateway port to the
 * ingress controller (OC-2 / CONN.4 safeguard).
 *
 * Trusted-proxy auth trusts the user-identity header only from a configured proxy
 * source — but that trust is only sound if **nothing else can reach the gateway
 * port directly**. This policy admits ingress to the gateway port solely from the
 * ingress-nginx namespace, so no other in-cluster pod can connect and assert an
 * arbitrary `X-Forwarded-User`. It scopes a single port for one ingress rule;
 * kubelet health probes are exempt from NetworkPolicy under GKE Dataplane V2.
 *
 * @param config         - Operator config (the gateway port + ingress namespace).
 * @param tenant         - The tenant whose pod the policy selects.
 * @param namespace      - Namespace the policy is created in.
 * @param ingressNamespace - Namespace of the ingress controller (default `ingress-nginx`).
 */
export function _BuildGatewayNetworkPolicy(
  config: OpenClawTenantOperatorConfig,
  tenant: Tenant,
  namespace: string,
  ingressNamespace = "ingress-nginx",
): k8s.V1NetworkPolicy
{
  const name = tenant.metadata!.name!;
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: `openclaw-${name}-gateway`,
      namespace,
      labels: _BuildTenantLabels(name),
    },
    spec: {
      // Select this tenant's pod(s) by the standard tenant labels.
      podSelector: { matchLabels: _BuildTenantLabels(name) },
      policyTypes: ["Ingress"],
      ingress: [
        {
          // `_from` is the @kubernetes/client-node property name; it serialises to
          // the NetworkPolicy `from` field on the wire.
          _from: [{ namespaceSelector: { matchLabels: { [_NAMESPACE_NAME_LABEL]: ingressNamespace } } }],
          ports: [{ protocol: "TCP", port: config.gatewayPort }],
        },
      ],
    },
  };
}
