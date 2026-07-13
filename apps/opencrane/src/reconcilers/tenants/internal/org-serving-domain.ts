/**
 * Resolve an org's SINGLE serving host under the fixed-wildcard topology. Every user in
 * the org connects through this one host; the in-process gateway proxy routes each
 * connection to the right pod, so there are no per-user subdomains.
 *
 * Precedence:
 *   1. A customer-vanity domain CNAMEd onto the org apex, when set — the org is
 *      reachable under that name, so it serves there.
 *   2. The org's DERIVED apex `<org>.<platformBaseDomain>` — the canonical home,
 *      used when a parent org is resolved with no vanity overlay.
 *   3. The bare `platformBaseDomain` — for ref-less openclaws with no parent org, so
 *      the single-install default path (`<base>`) is byte-for-byte unchanged.
 *
 * @param orgName - The parent ClusterTenant name, or undefined for a ref-less openclaw.
 * @param vanityDomain - Optional customer-vanity domain CNAMEd onto the org apex.
 * @param platformBaseDomain - The platform wildcard base (operator `INGRESS_DOMAIN`).
 * @returns The serving domain to derive the UserTenant host from.
 */
export function _ResolveOrgServingDomain(orgName: string | undefined, vanityDomain: string | undefined, platformBaseDomain: string): string
{
  if (vanityDomain && vanityDomain.trim())
  {
    return vanityDomain.trim();
  }
  if (orgName && orgName.trim())
  {
    // Mirrors @opencrane/contracts `_BuildOrgDomain`; inlined because the operator
    // intentionally carries no dependency on the contracts package (operator-local
    // types only), keeping the reconcile path free of cross-package coupling.
    return `${orgName.trim()}.${platformBaseDomain}`;
  }
  return platformBaseDomain;
}
