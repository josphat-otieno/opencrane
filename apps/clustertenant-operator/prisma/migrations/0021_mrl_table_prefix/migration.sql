-- Migration 0021: Prefix the model-routing telemetry tables with `mrl_` (model routing logic).
--
-- Draws the measurements-vs-decisions seam in the schema. The shadow-mode measurement table and
-- the eval-case table are append-heavy, FK-free telemetry (version-stamped by value, no relations)
-- and are the splittable half of Track AIR — they may later move to an isolated analytical store.
-- The `mrl_` prefix marks that boundary now so the eventual extraction is a config change, not a
-- rename-everything migration. Routing *decisions* (routing_proposals) and the model registry stay
-- as-is: they are transactional control-plane state, FK-coupled, and never leave this database.
--
-- Pure rename — no column or data changes. Constraints and indexes are renamed to keep the `mrl_`
-- convention consistent (Postgres keeps the old names on a bare table rename otherwise).

-- routing_measurements -> mrl_measurements
ALTER TABLE "routing_measurements" RENAME TO "mrl_measurements";
ALTER TABLE "mrl_measurements" RENAME CONSTRAINT "routing_measurements_pkey" TO "mrl_measurements_pkey";
ALTER INDEX "routing_measurements_skill_idx" RENAME TO "mrl_measurements_skill_idx";

-- routing_eval_cases -> mrl_eval_cases
ALTER TABLE "routing_eval_cases" RENAME TO "mrl_eval_cases";
ALTER TABLE "mrl_eval_cases" RENAME CONSTRAINT "routing_eval_cases_pkey" TO "mrl_eval_cases_pkey";
ALTER INDEX "routing_eval_cases_skill_idx" RENAME TO "mrl_eval_cases_skill_idx";
