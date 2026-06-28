import { execSync } from "node:child_process";

import { ___CreateLogger } from "@opencrane/observability";

/** Structured logger for the migration init container — JSON to stdout for central scraping. */
const _log = ___CreateLogger("fleet-manager-migrate");

/**
 * Standalone migration runner for the FLEET registry database (ClusterTenant / BillingAccount /
 * OrgMembership). Intended as the fleet-manager Deployment's init container so the server never
 * boots against an un-migrated registry. Runs `prisma migrate deploy` to apply pending migrations.
 */
function _runMigrations(): void
{
  _log.info("running fleet registry migrations");

  try
  {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      // dist/scripts/migrate.js → up two levels to the fleet-operator package root, where
      // prisma/schema.prisma lives (the cwd `prisma migrate deploy` expects).
      cwd: new URL("../../", import.meta.url).pathname,
    });
    _log.info("migrations complete");
  }
  catch (err)
  {
    _log.error({ err }, "migration failed");
    process.exit(1);
  }
}

_runMigrations();
