-- Migration 0023: org-admin model — BillingAccount + OrgMembership (ORG-ADMIN.1)
--
-- Implements the self-serve org-admin flow: a normal authenticated user creates a
-- billing account, then creates an organisation (ClusterTenant) and becomes its
-- root owner. Org-admin authority is DERIVED from membership rows, never a global
-- flag. Both tables are additive; existing cluster_tenants rows are untouched.

-- 1. Closed-set role enum (DB values mirror the @map labels on OrgRole in schema.prisma).
CREATE TYPE "OrgRole" AS ENUM ('owner', 'admin', 'member');

-- 2. Billing account: the prerequisite for creating an org. Keyed to the caller's
--    IdP-verified subject (one account per subject); email is recorded for human
--    reconciliation only (a subject's email can change while its `sub` is stable).
CREATE TABLE "billing_accounts" (
  "id"           TEXT NOT NULL,
  "subject"      TEXT NOT NULL,
  "email"        TEXT,
  "display_name" TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

-- One billing account per subject; the create is idempotent on this constraint.
CREATE UNIQUE INDEX "billing_accounts_subject_key" ON "billing_accounts"("subject");
CREATE INDEX "billing_accounts_subject_idx" ON "billing_accounts"("subject");

-- 3. Org membership: binds a subject to a ClusterTenant with a role. Authority is
--    derived from these rows. Cascades on org delete so memberships never linger.
CREATE TABLE "org_memberships" (
  "id"             TEXT NOT NULL,
  "cluster_tenant" TEXT NOT NULL,
  "subject"        TEXT NOT NULL,
  "role"           "OrgRole" NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);

-- One membership per (org, subject).
CREATE UNIQUE INDEX "org_memberships_cluster_tenant_subject_key" ON "org_memberships"("cluster_tenant", "subject");
CREATE INDEX "org_memberships_subject_idx" ON "org_memberships"("subject");
CREATE INDEX "org_memberships_cluster_tenant_idx" ON "org_memberships"("cluster_tenant");

-- At most one `owner` per org: a partial unique index over the org for owner rows
-- only. The creator becomes that single owner transactionally with the org create.
CREATE UNIQUE INDEX "org_memberships_one_owner_per_org" ON "org_memberships"("cluster_tenant") WHERE "role" = 'owner';

ALTER TABLE "org_memberships"
  ADD CONSTRAINT "org_memberships_cluster_tenant_fkey"
  FOREIGN KEY ("cluster_tenant") REFERENCES "cluster_tenants"("name") ON DELETE CASCADE ON UPDATE CASCADE;
