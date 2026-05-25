/** Dataset scopes grouped by membership visibility. */
export interface DatasetMembership
{
  /** Org-wide datasets available to the tenant. */
  org: string[];
  /** Team-level datasets available to the tenant. */
  team: string[];
  /** Project-level datasets available to the tenant. */
  project: string[];
  /** Personal datasets available to the tenant. */
  personal: string[];
}
