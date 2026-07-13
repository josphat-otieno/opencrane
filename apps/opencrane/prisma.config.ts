import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "prisma/config";

// Directory of THIS config file (the @opencrane/server package root). Resolving the schema
// and migrations paths against it — rather than as relative paths against the process CWD —
// keeps discovery correct no matter which directory `prisma` is invoked from (the migrate
// init container runs from the package root, the image build runs from the repo root).
const _packageRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Prisma config for the control-plane database.
 *
 * The schema is a multi-file FOLDER (`prisma/schema/`), with the `datasource` block living in
 * `prisma/schema/base.prisma`. Under Prisma 6 folder-mode, the migrations directory defaults to
 * `<datasource-file-dir>/migrations` — i.e. `prisma/schema/migrations`, NOT the conventional
 * `prisma/migrations` sibling. Our migrations live in `prisma/migrations`, so without this
 * explicit `migrations.path` `prisma migrate deploy` finds ZERO migrations ("No migration found")
 * and leaves the DB schemaless. Declaring both paths here fixes discovery and also supersedes the
 * deprecated `package.json#prisma` config (removed in Prisma 7).
 */
export default defineConfig({
  schema: path.join(_packageRoot, "prisma", "schema"),
  migrations: {
    path: path.join(_packageRoot, "prisma", "migrations"),
  },
});
