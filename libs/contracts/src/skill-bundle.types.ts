import type { Grant } from "./grant.types.js";
import { GrantScope } from "./grant.types.js";

/** Publishing state returned for a skill bundle. */
export enum SkillBundleStatus
{
  Published = "published",
  Review = "review",
  Draft = "draft",
}

/** Approval state returned for a skill promotion record. */
export enum SkillPromotionStatus
{
  Proposed = "proposed",
  Approved = "approved",
  Rejected = "rejected",
}

/**
 * Shared promotion history contract for a skill bundle.
 *
 * Promotions capture how a bundle moves through organizational scopes before it
 * becomes broadly available to tenant runtimes.
 */
export interface SkillPromotion
{
  /** Stable promotion identifier. */
  id: string;
  /** Scope being promoted from. */
  fromScope: GrantScope;
  /** Scope being promoted to. */
  toScope: GrantScope;
  /** Operator or service account authoring the promotion. */
  promotedBy: string;
  /** Approval state for the promotion. */
  status: SkillPromotionStatus;
  /** Optional operator note. */
  notes?: string;
}

/**
 * Shared API contract for a skill bundle shown in the catalog UI.
 *
 * The backend emits this shape and the UI renders it directly, so catalog
 * metadata, grants, and promotion history stay in one shared contract package.
 */
export interface SkillBundle
{
  /** Stable bundle identifier. */
  id: string;
  /** Display name shown in the catalog. */
  name: string;
  /** Operator-facing summary. */
  description: string;
  /** Semantic version label. */
  version: string;
  /** Immutable content digest. */
  digest: string;
  /** Highest scope where the bundle is promoted. */
  scope: GrantScope;
  /** Current publishing state. */
  status: SkillBundleStatus;
  /** Search and categorization labels. */
  tags: string[];
  /** Grants compiled for access decisions. */
  grants: Grant[];
  /** Promotion history linked to the bundle. */
  promotions: SkillPromotion[];
  /** Optional upstream source label. */
  sourceName?: string;
  /** Last publish timestamp in ISO-8601 form. */
  publishedAt?: string;
}
