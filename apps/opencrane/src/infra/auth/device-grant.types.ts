/**
 * Types for the RFC 8628-style device authorization grant flow.
 *
 * The flow:
 *   1. CLI posts to POST /auth/device → receives deviceCode + userCode + verificationUri.
 *   2. CLI opens verificationUri in the user's browser.
 *   3. Browser hits GET /auth/device/activate?userCode=<code> (requires OIDC session).
 *   4. Server creates a DB access token and marks the grant as "authorized".
 *   5. CLI polls GET /auth/device/token?deviceCode=<code> until "authorized".
 *   6. CLI stores the returned plain-text token in ~/.config/opencrane/credentials.json.
 */

/** A pending or authorized device authorization grant. */
export interface DeviceGrantInfo
{
  /** Cryptographically random secret code — known to the CLI only. */
  deviceCode: string;

  /** Short human-readable code the user sees (e.g. ABCD-1234). */
  userCode: string;

  /** Absolute expiry timestamp (5 minutes from creation). */
  expiresAt: Date;

  /** Current lifecycle state of the grant. */
  status: "pending" | "authorized";

  /** Plain-text access token; set only once the grant is authorized. */
  accessToken?: string;
}

/** Shape returned by the CLI polling endpoint GET /auth/device/token. */
export interface DevicePollResult
{
  /** Current state visible to the polling CLI. */
  status: "pending" | "authorized" | "expired";

  /**
   * Plain-text access token.
   * Present only when status is "authorized"; absent for all other states.
   */
  accessToken?: string;
}
