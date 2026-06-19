/** Runtime configuration for OIDC-backed control-plane sessions. */
export interface OidcAuthConfig
{
  /** Whether OIDC is enabled for human login flows. */
  enabled: boolean;

  /** Issuer URL used for OIDC discovery. */
  issuerUrl: string;

  /** Registered OAuth client identifier. */
  clientId: string;

  /** Optional confidential-client secret. */
  clientSecret?: string;

  /** Callback URI registered with the identity provider. */
  redirectUri: string;

  /** OIDC scopes requested during login. */
  scopes: string;

  /** Secret used to sign the local session cookie. */
  sessionSecret: string;

  /** Session cookie name. */
  cookieName: string;

  /** Whether the session cookie must be HTTPS-only. */
  cookieSecure: boolean;

  /** Session lifetime in milliseconds. */
  sessionMaxAgeMs: number;

  /** Lowercased allowlist of email domains. */
  allowedEmailDomains: string[];

  /** Lowercased allowlist of full email addresses. */
  allowedEmails: string[];

  /** Claim name carrying the caller's group memberships (default `groups`). */
  groupsClaim: string;

  /** Claim name carrying the caller's roles (default `roles`); unioned into `groups`. */
  rolesClaim: string;

  /**
   * Lowercased group names that mark a caller as a platform operator. A caller is
   * a platform operator iff their groups intersect this set. Empty by default, so
   * nobody is a platform operator until configured (fail-closed). Sourced from
   * `OPENCRANE_PLATFORM_OPERATOR_GROUPS`.
   *
   * TODO: superseded once OpenCrane gains a first-class role model — this is the
   * non-presumptuous, config-driven stopgap, not a role system.
   */
  platformOperatorGroups: string[];
}
