import type { PrismaClient } from "@prisma/client";

/**
 * Resolve the caller's ClusterTenant from their IdP-verified email, fail-closed. At most one tenant
 * may match, and its `clusterTenantRef` is returned; null on a missing/ambiguous email or any lookup
 * failure — never an arbitrary pick, never taken from request input.
 *
 * Single source of truth (Track AIR) for the ClusterTenant scope guard (mutation authz) and the
 * read-time scope filters (the savings-recommendation feed + the metrics proxy). Keep these on one
 * implementation so the fail-closed rule cannot drift between call sites.
 *
 * @param prisma - Prisma client for the email→tenant→clusterTenantRef lookup.
 * @param email  - The session's verified email claim, if any.
 * @returns The caller's owning ClusterTenant ref, or null when unresolved/ambiguous.
 */
export async function _ResolveCallerClusterTenant(prisma: PrismaClient, email: string | undefined): Promise<string | null>
{
  const normalized = typeof email === "string" ? email.toLowerCase().trim() : "";
  if (!normalized)
  {
    return null;
  }

  try
  {
    const matches = await prisma.tenant.findMany({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { clusterTenantRef: true },
      take: 2,
    });
    if (matches.length !== 1)
    {
      return null;
    }
    return matches[0].clusterTenantRef ?? null;
  }
  catch
  {
    return null;
  }
}
