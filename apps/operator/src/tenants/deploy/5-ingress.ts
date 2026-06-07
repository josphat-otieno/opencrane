import type * as k8s from "@kubernetes/client-node";

import type { IngressBinding } from "../../hosting/index.js";
import type { OperatorConfig } from "../../config.js";
import type { Tenant } from "../models/tenant.interface.js";
import { _BuildIngressHost } from "./ingress-host.js";
import { _BuildTenantLabels } from "./tenant-labels.js";

/**
 * Build the tenant Ingress that exposes the gateway on its assigned hostname.
 *
 * Ingress class and provider annotations come from the hosting adapter's IngressBinding,
 * so the builder stays provider-agnostic: nginx on-prem, gce on GKE, etc.
 */
export function _BuildIngress(config: OperatorConfig, ingressBinding: IngressBinding, tenant: Tenant, namespace: string): k8s.V1Ingress
{
  const name = tenant.metadata!.name!;
  const host = _BuildIngressHost(name, config.ingressDomain);

  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name: `openclaw-${name}`,
      namespace,
      labels: _BuildTenantLabels(name),
      annotations: ingressBinding.annotations,
    },
    spec: {
      ingressClassName: ingressBinding.ingressClassName,
      rules: [
        {
          host,
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: {
                  service: {
                    name: `openclaw-${name}`,
                    port: { number: config.gatewayPort },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
}
