-- Migration 0009: Company personalisation docs, versioning, reconciliation (P4C.3-P4C.5)

CREATE TYPE "DocProposalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- L1 company documents and their immutable versions (P4C.3)
CREATE TABLE "company_docs" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "current_version" INTEGER NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_docs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "company_docs_name_key" ON "company_docs"("name");

CREATE TABLE "company_doc_versions" (
  "id"             TEXT NOT NULL,
  "company_doc_id" TEXT NOT NULL,
  "version"        INTEGER NOT NULL,
  "content"        TEXT NOT NULL,
  "created_by"     TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_doc_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "company_doc_versions_company_doc_id_version_key" ON "company_doc_versions"("company_doc_id", "version");
CREATE INDEX "company_doc_versions_company_doc_id_idx" ON "company_doc_versions"("company_doc_id");
ALTER TABLE "company_doc_versions"
  ADD CONSTRAINT "company_doc_versions_company_doc_id_fkey"
  FOREIGN KEY ("company_doc_id") REFERENCES "company_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-tenant effective L2 doc + reconciliation cursor (P4C.4/P4C.5)
CREATE TABLE "tenant_workspace_docs" (
  "id"                      TEXT NOT NULL,
  "tenant"                  TEXT NOT NULL,
  "doc_name"                TEXT NOT NULL,
  "content"                 TEXT NOT NULL,
  "last_reconciled_version" INTEGER NOT NULL DEFAULT 0,
  "updated_at"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_workspace_docs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenant_workspace_docs_tenant_doc_name_key" ON "tenant_workspace_docs"("tenant", "doc_name");
CREATE INDEX "tenant_workspace_docs_tenant_idx" ON "tenant_workspace_docs"("tenant");
ALTER TABLE "tenant_workspace_docs"
  ADD CONSTRAINT "tenant_workspace_docs_tenant_fkey"
  FOREIGN KEY ("tenant") REFERENCES "tenants"("name") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pending/decided reconciliation proposals (P4C.4/P4C.5)
CREATE TABLE "doc_merge_proposals" (
  "id"               TEXT NOT NULL,
  "tenant"           TEXT NOT NULL,
  "doc_name"         TEXT NOT NULL,
  "base_version"     INTEGER NOT NULL,
  "target_version"   INTEGER NOT NULL,
  "proposed_content" TEXT NOT NULL,
  "diff"             TEXT NOT NULL,
  "status"           "DocProposalStatus" NOT NULL DEFAULT 'pending',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at"       TIMESTAMP(3),
  "decided_by"       TEXT,
  CONSTRAINT "doc_merge_proposals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "doc_merge_proposals_tenant_doc_name_target_version_key" ON "doc_merge_proposals"("tenant", "doc_name", "target_version");
CREATE INDEX "doc_merge_proposals_tenant_doc_name_idx" ON "doc_merge_proposals"("tenant", "doc_name");
CREATE INDEX "doc_merge_proposals_status_idx" ON "doc_merge_proposals"("status");
ALTER TABLE "doc_merge_proposals"
  ADD CONSTRAINT "doc_merge_proposals_tenant_fkey"
  FOREIGN KEY ("tenant") REFERENCES "tenants"("name") ON DELETE CASCADE ON UPDATE CASCADE;
