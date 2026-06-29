-- Fleet registry initial schema (ADR 0002 fleet/silo split).
-- fleet-manager is the cluster-wide singleton; this is its OWN registry database:
-- the ClusterTenant catalogue, billing accounts, and org memberships.

CREATE TYPE "ClusterTenantIsolationTier" AS ENUM ('shared', 'dedicatedNodes', 'dedicatedCluster');
CREATE TYPE "ClusterTenantComputeMode" AS ENUM ('shared', 'dedicated');
CREATE TYPE "OrgRole" AS ENUM ('owner', 'admin', 'member');

CREATE TABLE "cluster_tenants" (
    "name"                 TEXT NOT NULL,
    "display_name"         TEXT NOT NULL,
    "vanity_domain"        TEXT,
    "isolation_tier"       "ClusterTenantIsolationTier" NOT NULL DEFAULT 'shared',
    "compute_mode"         "ClusterTenantComputeMode" NOT NULL DEFAULT 'shared',
    "node_pool"            TEXT,
    "quota"                JSONB,
    "phase"                TEXT NOT NULL DEFAULT 'pending',
    "message"              TEXT,
    "bound_namespace"      TEXT,
    "provisioner"          TEXT,
    "zitadel_org_id"       TEXT,
    "zitadel_app_id"       TEXT,
    "zitadel_client_id"    TEXT,
    "zitadel_redirect_uri" TEXT,
    "zitadel_project_id"   TEXT,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cluster_tenants_pkey" PRIMARY KEY ("name")
);

CREATE UNIQUE INDEX "cluster_tenants_vanity_domain_key" ON "cluster_tenants"("vanity_domain");

CREATE TABLE "billing_accounts" (
    "id"           TEXT NOT NULL,
    "subject"      TEXT NOT NULL,
    "email"        TEXT,
    "display_name" TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_accounts_subject_key" ON "billing_accounts"("subject");
CREATE INDEX "billing_accounts_subject_idx" ON "billing_accounts"("subject");

CREATE TABLE "org_memberships" (
    "id"             TEXT NOT NULL,
    "cluster_tenant" TEXT NOT NULL,
    "subject"        TEXT NOT NULL,
    "role"           "OrgRole" NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_memberships_cluster_tenant_subject_key" ON "org_memberships"("cluster_tenant", "subject");
CREATE INDEX "org_memberships_subject_idx" ON "org_memberships"("subject");
CREATE INDEX "org_memberships_cluster_tenant_idx" ON "org_memberships"("cluster_tenant");

ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_cluster_tenant_fkey"
    FOREIGN KEY ("cluster_tenant") REFERENCES "cluster_tenants"("name") ON DELETE CASCADE ON UPDATE CASCADE;
