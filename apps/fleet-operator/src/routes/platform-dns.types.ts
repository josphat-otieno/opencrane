import type { CertIssuerKind } from "../core/platform-dns/cluster-issuer.types.js";

/** Request body to configure the platform DNS-01 issuer (CONN.8a). */
export interface SetPlatformDnsRequest
{
  /** Solver provider key (cloudflare | digitalocean | route53 | rfc2136 | …). */
  provider: string;
  /** Base/delegated DNS zone the wildcard cert covers (e.g. `ai.elewa.ke`). */
  zone: string;
  /** ACME account contact email. */
  email: string;
  /** ACME directory URL; defaults to Let's Encrypt production when omitted. */
  server?: string;
  /** ClusterIssuer name to create/update; defaults to `opencrane-issuer`. */
  issuerName?: string;
  /** API token for token-based providers (stored in a Secret, never echoed). */
  apiToken?: string;
  /** Raw solver block for providers needing more than a token (route53/rfc2136). */
  solverConfig?: Record<string, unknown>;
}

/** Response describing the currently configured platform DNS issuer. */
export interface PlatformDnsStatus
{
  /** Whether an issuer is configured. */
  configured: boolean;
  /** Issuer name. */
  issuerName: string;
  /** Issuer kind — `ClusterIssuer` (cluster-wide) or `Issuer` (namespaced, MI.4). */
  issuerKind: CertIssuerKind;
  /** Namespace of the namespaced `Issuer`, or null for a cluster-wide `ClusterIssuer`. */
  issuerNamespace: string | null;
  /** The configured solver provider, when discoverable. */
  provider: string | null;
  /** The ACME account email, when configured. */
  email: string | null;
  /** The ACME directory URL, when configured. */
  server: string | null;
}
