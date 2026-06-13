/**
 * DNS-provider configuration captured by the onboarding CLI/API (CONN.8a).
 *
 * Drives the cert-manager ACME DNS-01 `ClusterIssuer` that issues the wildcard
 * `*.<zone>` cert tenant Ingresses serve. Wildcards require DNS-01, so a
 * provider credential is needed to write the `_acme-challenge.<zone>` TXT record.
 */
export interface DnsProviderConfig
{
  /** Solver provider key, e.g. `cloudflare`, `digitalocean`, `route53`, `rfc2136`. */
  provider: string;
  /** Base/delegated DNS zone the wildcard covers (e.g. `ai.elewa.ke`). */
  zone: string;
  /** ACME account contact email (required by the CA). */
  email: string;
  /** ACME directory URL; defaults to Let's Encrypt production when omitted. */
  server?: string;
  /** ClusterIssuer name to create/update. */
  issuerName: string;
  /**
   * API token for token-based providers (cloudflare/digitalocean). When set, it
   * is stored in a Secret the solver references; never rendered inline.
   */
  apiToken?: string;
  /**
   * Raw provider solver block for providers that need more than a token
   * (route53 keys, rfc2136 TSIG, …). Rendered verbatim under the provider key.
   */
  solverConfig?: Record<string, unknown>;
}

/** A rendered cert-manager DNS credentials Secret (when a token was supplied). */
export interface RenderedDnsSecret
{
  /** Secret name the ClusterIssuer solver references. */
  name: string;
  /** Namespace the cert-manager controller reads solver Secrets from. */
  namespace: string;
  /** Data key holding the token. */
  key: string;
  /** The Kubernetes Secret manifest (stringData carries the plaintext token). */
  manifest: Record<string, unknown>;
}
