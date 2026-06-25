/**
 * Control-plane → Zitadel Management API seam (S3 / silo Phase 2a).
 *
 * The control-plane is the system-of-record that PROVISIONS Zitadel: on ClusterTenant
 * create it makes a dedicated Zitadel Organization + OIDC app + project roles for the
 * org's isolated user pool, and grants the tenant master `admin` (cross-org); on delete
 * it tears the org down. This interface is the single seam those lifecycle hooks call,
 * so the orchestration (and its transactional rollback) is testable against a fake and
 * the live HTTP implementation can be swapped in without touching the call sites.
 */

/** Inputs needed to provision a ClusterTenant's Zitadel org + login surface. */
export interface ProvisionOrgInput
{
  /** ClusterTenant name (the org key) — used to name the Zitadel org + derive the host. */
  orgName: string;
  /** Human-readable org name for the Zitadel Organization display name. */
  displayName: string;
  /** The redirect URI to register on the org's OIDC app (`<org>.<base>/api/v1/auth/callback`). */
  redirectUri: string;
  /** IdP subject of the tenant master, granted `admin` on the new org (cross-org grant). */
  masterSubject: string;
}

/** The Zitadel identifiers persisted onto the ClusterTenant row after provisioning. */
export interface ProvisionOrgResult
{
  /** Provisioned Zitadel Organization id. */
  orgId: string;
  /** Provisioned OIDC application id (login surface for `<org>.<base>`). */
  appId: string;
  /** The redirect URI registered on the app (echoed for persistence). */
  redirectUri: string;
}

/**
 * Lifecycle operations the control-plane performs against Zitadel. Implementations MUST
 * be idempotent (the reconcile/backfill loop re-invokes them) and fail-loud (throw) so a
 * caller wrapping them in a DB transaction rolls the local write back on failure.
 */
export interface ZitadelManagementClient
{
  /** True when backed by a live Zitadel instance; false for the no-op (unconfigured) client. */
  readonly isLive: boolean;

  /**
   * Provision a dedicated Organization + OIDC app + roles for a ClusterTenant and grant
   * the master `admin`. Returns the identifiers to persist, or `null` when the client is
   * a no-op (unconfigured) — the caller then leaves the Zitadel columns null.
   */
  provisionOrg(input: ProvisionOrgInput): Promise<ProvisionOrgResult | null>;

  /** Tear down a previously-provisioned org (best-effort; tolerates an already-absent org). */
  teardownOrg(orgId: string): Promise<void>;
}
