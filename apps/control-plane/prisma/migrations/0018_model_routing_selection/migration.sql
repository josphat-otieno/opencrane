-- Migration 0018: Model selection posture + scope defaults (Track AIR — AIR.2/3/4).
--
-- Skills gain a model posture (pinned | auto | inherit); a scope-level default table backs the
-- precedence chain (explicit > skill-pinned > auto > global default). Additive + opt-in: existing
-- skills get NULL posture (inherit) and behave unchanged.

CREATE TYPE "SkillModelMode" AS ENUM ('pinned', 'auto');

ALTER TABLE "skills"
  ADD COLUMN "model_mode"   "SkillModelMode",
  ADD COLUMN "pinned_model" TEXT,
  ADD COLUMN "auto_config"  JSONB;

CREATE TABLE "model_routing_defaults" (
  "id"             TEXT NOT NULL,
  "scope"          "ModelRoutingScope" NOT NULL DEFAULT 'global',
  "cluster_tenant" TEXT,
  "default_model"  TEXT,
  "auto_config"    JSONB,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "model_routing_defaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "model_routing_defaults_scope_cluster_tenant_key" ON "model_routing_defaults" ("scope", "cluster_tenant");
