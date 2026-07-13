import type { Logger } from "pino";

import { OidcAuthServiceBase } from "@opencrane/infra/auth";

import type { PrismaClient } from "../../generated/prisma/index.js";

/**
 * The fleet-manager's OIDC auth service. The fleet plane authenticates against a SINGLE
 * Zitadel project (its own fleet project with fleet-level roles) — there is no per-org
 * client resolution and no `clusterTenant` enrichment, so it uses the shared
 * {@link OidcAuthServiceBase} as-is (single masters client, membership-derived org-admin
 * facts). The clustertenant-manager is the one that overrides the per-org seams.
 */
export class FleetOidcAuthService extends OidcAuthServiceBase {}

/**
 * Create the OIDC auth service used by the fleet-manager Express app.
 * @param log    - Parent logger.
 * @param prisma - Fleet registry client (also the base's `OrgMembership` read surface).
 */
export function ___CreateFleetOidcAuthService(log: Logger, prisma: PrismaClient): FleetOidcAuthService
{
  return new FleetOidcAuthService(log, prisma);
}
