-- Migration 0025: Zitadel provisioning fields (S3 / silo Phase 2a)
--
-- The control-plane becomes the system-of-record that provisions a per-org Zitadel
-- Organization + OIDC app. Record the resulting identifiers on the ClusterTenant so
-- the org's login surface is resolvable, and bind each openclaw Tenant to its owning
-- user's OIDC subject (the 1:1 link the contract compiler inherits rights through).
-- All columns are nullable so existing rows + the unconfigured (no-Zitadel) path are
-- unaffected.

-- 1. ClusterTenant: the provisioned Zitadel org/app identifiers.
ALTER TABLE "cluster_tenants"
  ADD COLUMN "zitadel_org_id" TEXT,
  ADD COLUMN "zitadel_app_id" TEXT,
  ADD COLUMN "zitadel_redirect_uri" TEXT;

-- A Zitadel org id maps to at most one ClusterTenant (ignore the many NULLs).
CREATE UNIQUE INDEX "cluster_tenants_zitadel_org_id_key"
  ON "cluster_tenants" ("zitadel_org_id")
  WHERE "zitadel_org_id" IS NOT NULL;

-- 2. Tenant: the owning user's IdP-verified subject (OIDC sub).
ALTER TABLE "tenants"
  ADD COLUMN "subject" TEXT;
