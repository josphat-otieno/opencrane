import type { PrismaClient } from "@prisma/client";

import { _log } from "../../log.js";
import { _ClusterTenantFromHost } from "./request-silo.js";
import type { ResolvedPerOrgClient } from "./per-org-client.types.js";

/**
 * Build the Zitadel org-restriction login scope for an org id. Adding
 * `urn:zitadel:iam:org:id:{orgId}` to the authorization request restricts the login to
 * that organisation's user pool, so only members of the org may authenticate at its host.
 * Centralised so the provisioner-side string and the login-side string can never drift.
 *
 * @param orgId - The Zitadel Organization id of the per-org client.
 * @returns The org-scope string to append to the OIDC `scope` parameter.
 * @see https://zitadel.com/docs/apis/openidoauth/scopes
 */
export function _OrgScope(orgId: string): string
{
  return `urn:zitadel:iam:org:id:${orgId}`;
}

/** Prisma `select` for the persisted per-org login identifiers (shared by both lookups). */
const _PER_ORG_SELECT = { name: true, zitadelClientId: true, zitadelOrgId: true, zitadelRedirectUri: true } as const;

/**
 * Resolve the per-org OIDC client for a request host (S3b). A host resolves to a
 * ClusterTenant two ways, both DB-authoritative:
 *  - **canonical** `<org>.<base>` — the first DNS label names the silo, or
 *  - **customer-vanity** — the full host matches a unique `vanityDomain` (CNAMEd onto the
 *    org apex), so login works at the customer's own domain too.
 * Either way we return the org's `{clientId, orgId, redirectUri}` so login authorizes
 * against that org's isolated user pool. Fail-closed: returns null for
 *  - a bare host (no label and no vanity match — e.g. the platform host / localhost),
 *  - a host matching no ClusterTenant by either label or vanity, or
 *  - a ClusterTenant whose org is not fully provisioned (no `zitadelClientId`/`zitadelOrgId`).
 * In every null case the caller falls through to the masters client config — never a
 * partial per-org login. The DB read is the single source of truth, so a spoofed host that
 * names no real, fully-provisioned org cannot pick up an org client.
 *
 * @param prisma - Prisma client used to confirm the silo and read its persisted client ids.
 * @param host   - The request host (typically from `_RequestHost`).
 * @returns The resolved per-org client, or null to fall through to the masters client.
 */
export async function _ResolvePerOrgClient(prisma: PrismaClient, host: string | undefined): Promise<ResolvedPerOrgClient | null>
{
  if (!host)
  {
    // No host on the request (e.g. a non-proxied internal call) — there is nothing to
    // resolve a silo from, so login uses the masters client. Benign and expected, so debug.
    _log.debug("per-org client resolution: request carries no host; falling through to masters client");
    return null;
  }
  // 1. Resolve the ClusterTenant for this host. Try the canonical first DNS label first
  //    (the common case, one indexed lookup), then fall back to an exact vanity-domain
  //    match on the full host (port-stripped, lower-cased). Both are DB-authoritative, so a
  //    fabricated host that matches neither a real silo label nor a real vanity domain
  //    cannot select an org client it does not own.
  const candidate = _ClusterTenantFromHost(host);
  const normHost = host.split(":")[0].trim().toLowerCase();
  let row = candidate
    ? await prisma.clusterTenant.findUnique({ where: { name: candidate }, select: _PER_ORG_SELECT })
    : null;
  if (!row)
  {
    row = await prisma.clusterTenant.findUnique({ where: { vanityDomain: normHost }, select: _PER_ORG_SELECT });
  }
  if (!row)
  {
    // A host that matches no silo label and no vanity domain is usually probe/scanner noise
    // hitting the wildcard, not an operational fault — log at debug so it is traceable
    // without flooding the error log.
    _log.debug({ host, candidate }, "per-org client resolution: host matches no ClusterTenant (label or vanity); falling through to masters client");
    return null;
  }

  // 3. Fail-closed on a half-provisioned org: both the client_id (the credential) and the
  //    org id (the user-pool restriction scope) must exist, else we cannot build a SAFE
  //    org-scoped login and fall through to the masters client rather than logging in
  //    against the wrong / an unrestricted pool.
  if (!row.zitadelClientId || !row.zitadelOrgId)
  {
    // This is a real operational anomaly: a ClusterTenant exists for this host but its
    // Zitadel org is not fully provisioned, so login at its own subdomain silently
    // degrades to the masters client. Warn so the failed/pending provisioning surfaces
    // in the error log instead of presenting as a confusing wrong-pool login.
    _log.warn(
      { host, clusterTenant: row.name, hasClientId: Boolean(row.zitadelClientId), hasOrgId: Boolean(row.zitadelOrgId) },
      "per-org client resolution: ClusterTenant host is not fully provisioned in Zitadel; login falls through to masters client",
    );
    return null;
  }

  return {
    clusterTenant: row.name,
    clientId: row.zitadelClientId,
    orgId: row.zitadelOrgId,
    redirectUri: row.zitadelRedirectUri ?? null,
  };
}
