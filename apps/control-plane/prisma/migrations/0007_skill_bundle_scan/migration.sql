-- Migration 0007: Add scan status and findings to skill_bundles

CREATE TYPE "SkillBundleScanStatus" AS ENUM ('pending', 'scanning', 'passed', 'failed', 'skipped');

ALTER TABLE "skill_bundles"
  ADD COLUMN "scan_status"   "SkillBundleScanStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "scan_findings" JSONB,
  ADD COLUMN "scanned_at"    TIMESTAMP(3);

CREATE INDEX "skill_bundles_scan_status_idx" ON "skill_bundles"("scan_status");
