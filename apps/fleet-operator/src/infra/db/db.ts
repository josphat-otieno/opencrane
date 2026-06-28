import type { Logger } from "pino";

import { PrismaClient } from "../../generated/prisma/index.js";

/**
 * Creates and returns a configured PrismaClient for the fleet registry database.
 *
 * The client is generated to a package-local path (see prisma/schema.prisma `output`) so it does
 * not collide with clustertenant-manager's default `@prisma/client` generation in the monorepo —
 * hence the relative import above rather than `@prisma/client`.
 *
 * @param log - Logger for query and error output.
 * @returns A PrismaClient bound to the fleet registry DB (DATABASE_URL).
 */
export function ___CreateFleetPrismaClient(log: Logger): PrismaClient
{
  const prisma = new PrismaClient({
    log: [
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

  prisma.$on("error", function _onError(e) {
    log.error({ message: e.message, target: e.target }, "fleet prisma error");
  });

  prisma.$on("warn", function _onWarn(e) {
    log.warn({ message: e.message, target: e.target }, "fleet prisma warning");
  });

  return prisma;
}
