/**
 * Fleet-manager operator configuration.
 *
 * The fleet-manager's only reconcile loop is the ClusterTenantOperator, whose job
 * stops at ClusterTenant lifecycle: it binds the per-org namespace and provisions
 * the per-org domain (DNS + wildcard TLS). All the in-silo controllers — and the
 * 400-line `_LoadOperatorConfig` they share — moved to the clustertenant-platform
 * (Stage 5), so the fleet keeps only the handful of fields the CT operator + its
 * org-domain provisioner read.
 *
 * @see apps/clustertenant-operator/src/config.ts - the full operator config the silo loads.
 */

/** Cert-manager issuer kind for per-org wildcard certificates. */
export type CertManagerIssuerKind = "ClusterIssuer" | "Issuer";

/** Runtime configuration for the fleet ClusterTenant lifecycle reconcile loop. */
export interface FleetOperatorConfig
{
  /** Platform base domain each org's apex is derived from (`<org>.<ingressDomain>`). */
  ingressDomain: string;

  /**
   * Public ingress IP the per-org A records resolve to. Empty when external-dns
   * owns address assignment, in which case the provisioner declares the DNSEndpoint
   * without an explicit target.
   */
  ingressIp: string;

  /** cert-manager Issuer/ClusterIssuer name backing the per-org wildcard certificate. */
  certManagerIssuerName: string;

  /** Whether the issuer is namespaced (`Issuer`) or cluster-scoped (`ClusterIssuer`). */
  certManagerIssuerKind: CertManagerIssuerKind;
}

/**
 * Load the fleet operator configuration from the environment.
 *
 * Mirrors the env contract the silo's `_LoadOperatorConfig` uses for these four
 * fields so the fleet and silo read the same variables identically:
 *  - `INGRESS_DOMAIN` — required.
 *  - `INGRESS_IP` — optional (default empty).
 *  - `CERT_MANAGER_ISSUER_NAME` — optional (default `opencrane-issuer`).
 *  - `CERT_MANAGER_ISSUER_KIND` — optional (`Issuer` or `ClusterIssuer`, default `ClusterIssuer`).
 *
 * @returns The resolved fleet operator configuration.
 * @throws If `INGRESS_DOMAIN` is unset — the per-org domain cannot be derived without it.
 */
export function _LoadFleetOperatorConfig(): FleetOperatorConfig
{
  const ingressDomain = process.env.INGRESS_DOMAIN;
  if (!ingressDomain)
  {
    throw new Error("INGRESS_DOMAIN is required for the fleet ClusterTenant operator");
  }

  return {
    ingressDomain,
    ingressIp: process.env.INGRESS_IP ?? "",
    certManagerIssuerName: process.env.CERT_MANAGER_ISSUER_NAME ?? "opencrane-issuer",
    certManagerIssuerKind: process.env.CERT_MANAGER_ISSUER_KIND === "Issuer" ? "Issuer" : "ClusterIssuer",
  };
}
