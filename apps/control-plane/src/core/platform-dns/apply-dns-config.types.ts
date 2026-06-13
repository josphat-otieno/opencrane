/** Summary of a platform DNS-config apply (CONN.8a). */
export interface ApplyDnsConfigResult
{
  /** The ClusterIssuer that was created/updated. */
  issuerName: string;
  /** The DNS provider configured. */
  provider: string;
  /** The DNS zone the wildcard cert covers. */
  zone: string;
  /** The credentials Secret name written, or null when no token was supplied. */
  secretName: string | null;
}
