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
}
