import type { DatasetMembership } from "./dataset-membership.model";

/** Save payload emitted by the dataset membership editor form. */
export interface DatasetMembershipSaveEvent
{
  /** Updated membership values grouped by scope. */
  membership: DatasetMembership;
}
