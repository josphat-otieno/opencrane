import { DatasetScope } from "../../domain/retrieval/retrieval.types.js";

export { DatasetScope };

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
