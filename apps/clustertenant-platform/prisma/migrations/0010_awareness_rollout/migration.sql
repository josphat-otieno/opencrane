-- Migration 0010: Awareness contract versioning + canary rollout (P4B.3)

ALTER TABLE "tenants" ADD COLUMN "awareness_wave" TEXT;

CREATE TABLE "awareness_rollouts" (
  "id"             TEXT NOT NULL DEFAULT 'default',
  "target_version" TEXT NOT NULL,
  "stable_version" TEXT NOT NULL,
  "waves"          JSONB NOT NULL,
  "promoted_waves" JSONB NOT NULL,
  "shadow_mode"    BOOLEAN NOT NULL DEFAULT false,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "awareness_rollouts_pkey" PRIMARY KEY ("id")
);
