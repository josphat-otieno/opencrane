import type { CertIssuerKind } from "./cluster-issuer.types.js";

/** Summary of a platform DNS-config apply (CONN.8a). */
export interface ApplyDnsConfigResult
{
  /** The issuer that was created/updated. */
  issuerName: string;
  /** The kind of issuer written — `ClusterIssuer` (cluster-wide) or `Issuer` (namespaced). */
  issuerKind: CertIssuerKind;
  /** Namespace the namespaced `Issuer` (and its Secret) was written to, or null for a `ClusterIssuer`. */
  issuerNamespace: string | null;
  /** The DNS provider configured. */
  provider: string;
  /** The DNS zone the wildcard cert covers. */
  zone: string;
  /** The credentials Secret name written, or null when no token was supplied. */
  secretName: string | null;
}
