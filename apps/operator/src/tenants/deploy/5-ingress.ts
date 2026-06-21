import type * as k8s from "@kubernetes/client-node";

import type { IngressBinding } from "../../hosting/index.js";
import type { OpenClawTenantOperatorConfig } from "../../config.js";
import type { Tenant } from "../models/tenant.interface.js";
import { _BuildIngressHost } from "./ingress-host.js";
import { _BuildTenantLabels } from "./tenant-labels.js";

/**
 * Build the UserTenant Ingress that exposes the per-user OpenClaw gateway on its
 * assigned hostname. The host is `<name>.<ingressDomain>`, where `ingressDomain` is
 * the ClusterTenant base domain — so this is one Ingress per UserTenant, sitting under
 * the customer's (ClusterTenant's) domain. ("UserTenant" is the canonical doc name for
 * the `Tenant` CRD; the ClusterTenant is the customer / isolation unit that owns the
 * domain. See docs/agents/cluster-architecture.md → "Tenancy Model — ClusterTenant vs
 * UserTenant".)
 *
 * Ingress class and provider annotations come from the hosting adapter's IngressBinding,
 * so the builder stays provider-agnostic: nginx on-prem, gce on GKE, etc. When
 * `ingressTlsEnabled`, a `tls:` block is added referencing the shared wildcard cert
 * Secret (`ingressTlsSecretName`, populated by cert-manager — see CONN.8), so the
 * browser reaches `wss://<host>` over TLS the ingress terminates.
 */
export function _BuildIngress(config: OpenClawTenantOperatorConfig, ingressBinding: IngressBinding, tenant: Tenant, namespace: string, ingressDomain?: string): k8s.V1Ingress
{
  const name = tenant.metadata!.name!;
  // Prefer the resolved ClusterTenant base domain (CT.8) when supplied; otherwise fall
  // back to the per-instance ingress.domain so ref-less openclaws are unchanged.
  const host = _BuildIngressHost(name, ingressDomain ?? config.ingressDomain);

  // TLS termination: reference the shared wildcard Secret for this host. The Secret is
  // provisioned once by cert-manager (a wildcard Certificate for the ClusterTenant base
  // domain); per-UserTenant Ingresses do not request their own cert, so adding a
  // UserTenant needs no new issuance.
  const tls: k8s.V1IngressTLS[] | undefined = config.ingressTlsEnabled
    ? [{ hosts: [host], secretName: config.ingressTlsSecretName }]
    : undefined;

  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name: `openclaw-${name}`,
      namespace,
      labels: _BuildTenantLabels(name),
      // OC-2 / CONN.4 — trusted-proxy broker. Every gateway WS upgrade is
      // authenticated against the OIDC session by the control-plane: a valid
      // session → 204 + the verified user in `auth-response-headers`, which nginx
      // injects into the upstream request (overwriting any client-supplied value —
      // header hygiene), and the gateway (trusted-proxy mode) trusts it. No
      // session → 401 → the upgrade is refused, which is the central-cut hook
      // (revoke the session and re-connects are blocked).
      annotations: {
        ...ingressBinding.annotations,
        "nginx.ingress.kubernetes.io/auth-url": `${config.controlPlaneInternalUrl}/api/v1/auth/gateway-verify`,
        "nginx.ingress.kubernetes.io/auth-response-headers": config.gatewayTrustedProxyUserHeader,
      },
    },
    spec: {
      ingressClassName: ingressBinding.ingressClassName,
      ...(tls ? { tls } : {}),
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
