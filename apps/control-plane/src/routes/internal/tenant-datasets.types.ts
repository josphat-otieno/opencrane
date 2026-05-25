/** Dataset scopes supported by tenant dataset membership controls. */
export type DatasetScope = "org" | "team" | "project" | "personal";

/** Dataset membership lists grouped by scope. */
export interface TenantDatasetMembership
{
  /** Org-wide datasets a tenant can query. */
  org: string[];
  /** Team-scoped datasets a tenant can query. */
  team: string[];
  /** Project-scoped datasets a tenant can query. */
  project: string[];
  /** Personal datasets a tenant can query. */
  personal: string[];
}
