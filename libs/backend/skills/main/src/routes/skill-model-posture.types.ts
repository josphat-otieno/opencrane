/**
 * Route-local types for the skill model-posture API (Track AIR.3). The posture vocabulary
 * (`SkillModelMode`, `AutoRoutingConfig`) is owned by `@opencrane/contracts`; this file carries the
 * read/write DTO shapes and the validation envelope specific to the skill-posture endpoints.
 */

import type { AutoRoutingConfig, SkillModelMode } from "@opencrane/contracts";

/** The read projection of a `Skill` row's identity plus its model posture (Track AIR.3). */
export interface SkillModelPostureView
{
  /** Skill name (part of the compound key). */
  name: string;
  /** Skill scope, e.g. `org`/`team`/`personal` (part of the compound key). */
  scope: string;
  /** Owning team for team-scoped skills; empty string when not team-scoped (part of the compound key). */
  team: string;
  /** Workspace-relative path the skill is delivered to. */
  path: string;
  /** `pinned` (use `pinnedModel`), `auto` (route within `autoConfig`), or null (inherit the scope default). */
  modelMode: SkillModelMode | null;
  /** The pinned model's `publicModelName`, when `modelMode` is `pinned`. */
  pinnedModel: string | null;
  /** The skill's auto-routing config, when `modelMode` is `auto`. */
  autoConfig: AutoRoutingConfig | null;
  /** Creation timestamp (ISO-8601). */
  createdAt: string;
  /** Last-update timestamp (ISO-8601). */
  updatedAt: string;
}

/** Create/update body for a skill's model posture (Track AIR.3). */
export interface SkillModelPostureWrite
{
  /** Set `pinned` (requires `pinnedModel`), `auto` (validates `autoConfig`), or null to clear the posture (inherit default). */
  modelMode: SkillModelMode | null;
  /** Required when `modelMode` is `pinned`; the model's `publicModelName`. */
  pinnedModel?: string | null;
  /** Optional when `modelMode` is `auto`; the skill's auto-routing config. */
  autoConfig?: AutoRoutingConfig | null;
}

/** A `{ error, code }` validation-failure envelope, matching the platform's error convention. */
export interface ValidationFailure
{
  /** Human-readable failure reason. */
  error: string;
  /** Stable machine-readable code. */
  code: string;
}
