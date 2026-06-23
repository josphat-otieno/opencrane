/** Org owner identity projected into the ClusterTenant CR `spec.owner`. */
export interface ClusterTenantOwner
{
  /** The owner's OIDC subject (`sub`). */
  subject: string;
  /** The owner's IdP-verified email; becomes the default Tenant's contact email. */
  email?: string;
}

/**
 * Desired-state spec EXCLUDING the owner. This is the shape sent on a
 * merge-patch (update path): omitting `owner` means a JSON merge-patch
 * leaves the existing `spec.owner` untouched.
 */
export interface ClusterTenantCrSpecPatch
{
  displayName: string;
  vanityDomain?: string;
  isolationTier: string;
  compute: { mode: string; nodePool?: string };
  resources: { quota: Record<string, unknown> };
}

/** Full desired-state spec including the mandatory owner. */
export interface ClusterTenantSpec extends ClusterTenantCrSpecPatch
{
  owner: ClusterTenantOwner;
}
