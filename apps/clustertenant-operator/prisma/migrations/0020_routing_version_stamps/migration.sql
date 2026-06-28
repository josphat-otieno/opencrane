-- Migration 0020: Routing version coordinates (Track AIR — AIR.6/7 attribution).
--
-- Stamp every shadow measurement (and the proposal it emits) with the version coordinates that
-- make a datapoint attributable to a specific (skill content version × model deployment):
--   * skill_content_hash      — the Skill.content_hash at run time (mutable current content).
--   * skill_digest            — the live published SkillBundle.digest (immutable content version).
--   * candidate_model_id      — the stable ModelDefinition.litellm_model_id (vs the mutable slug).
--   * candidate_upstream_model — the ModelDefinition.upstream_model the deployment targets.
-- Proposals carry the same skill coordinates plus proposed_model_id. All additive + nullable: each
-- coordinate is resolved best-effort at write time, so a missing lookup leaves the column NULL and
-- never blocks a measurement. Existing rows keep NULL coordinates (no version attribution).

ALTER TABLE "routing_measurements"
  ADD COLUMN "skill_content_hash"       TEXT,
  ADD COLUMN "skill_digest"             TEXT,
  ADD COLUMN "candidate_model_id"       TEXT,
  ADD COLUMN "candidate_upstream_model" TEXT;

ALTER TABLE "routing_proposals"
  ADD COLUMN "skill_content_hash" TEXT,
  ADD COLUMN "skill_digest"       TEXT,
  ADD COLUMN "proposed_model_id"  TEXT;
