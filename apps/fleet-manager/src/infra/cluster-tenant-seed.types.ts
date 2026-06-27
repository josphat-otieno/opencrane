import type { ClusterTenantIsolationTier } from "@opencrane/contracts";

/**
 * Config-seeded ClusterTenant for the SINGLE-TENANT profile.
 *
 * The single-tenant install runs with the cluster-tenant manager + billing OFF, so
 * the billing-gated `POST /cluster-tenants` self-service path is unavailable. Instead
 * one org is seeded DIRECTLY at install: this is the desired-state for that org, read
 * from env at control-plane boot (the same env-driven seed pattern as the platform
 * operator). All fields come from install params; nothing here is request input.
 */
export interface ClusterTenantSeedConfig
{
  /** Stable org name (the ClusterTenant id / DB key + CR name). Empty → no seed. */
  name: string;
  /** Human-readable org display name; defaults to `name` when unset. */
  displayName: string;
  /**
   * IdP-verified identity recorded as the org's single `owner` OrgMembership. At
   * install we have only an email (the owner has not logged in yet), so it is used as
   * the membership subject — the documented "OIDC sub, else email" fallback. Empty →
   * the org is seeded with no owner membership (the CR + DB row still exist).
   */
  ownerEmail: string;
  /** Isolation tier for the seeded org (shared by default for a single-tenant box). */
  isolationTier: ClusterTenantIsolationTier;
}
