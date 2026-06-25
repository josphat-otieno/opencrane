-- Migration 0027: per-org Zitadel project id + unique vanity domain (S3b)
--
-- A ClusterTenant's vanity domain (e.g. ai.client-company.com) must serve the org's
-- login surface too: it has to be registered as a redirect URI on the org's Zitadel
-- OIDC app, and a login request arriving at the vanity host has to resolve to that org.
--
-- 1. Record the org's Zitadel `opencrane` project id so the control-plane can UPDATE the
--    OIDC app's redirect URIs (the Zitadel update endpoint is project-scoped) when the
--    vanity domain is added/changed/cleared via PUT. Nullable so existing rows and the
--    unconfigured (no-Zitadel) path are unaffected.
ALTER TABLE "cluster_tenants"
  ADD COLUMN "zitadel_project_id" TEXT;

-- 2. A vanity domain maps to at most one ClusterTenant, so per-org login can resolve a
--    vanity host to exactly one org's client. A standard unique index leaves the many
--    NULLs (orgs with no vanity) distinct in Postgres, so it does not constrain them.
CREATE UNIQUE INDEX "cluster_tenants_vanity_domain_key"
  ON "cluster_tenants" ("vanity_domain");
