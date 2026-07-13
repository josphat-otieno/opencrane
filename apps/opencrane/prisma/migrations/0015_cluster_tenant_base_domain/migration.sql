-- Migration 0015: ClusterTenant base domain (CT.8)
--
-- The ClusterTenant now carries its own customer-owned base domain (e.g.
-- ai.client-company.com). The operator derives each attached UserTenant's ingress
-- host as <user>.<base_domain>. Additive + backward-compatible: existing rows keep
-- base_domain NULL, which the operator treats as "fall back to the per-instance
-- ingress.domain", so behaviour is unchanged until a domain is set.

ALTER TABLE "cluster_tenants"
  ADD COLUMN "base_domain" TEXT;
