/**
 * Emit the OpenAPI 3.1 spec to the workspace dist folder.
 *
 * Run via:  pnpm --filter @opencrane/server emit-openapi
 *
 * Contract drift gate:
 *   pnpm --filter @opencrane/server emit-openapi
 *   nx run contracts:generate
 *   git diff --exit-code libs/contracts/src/generated/api.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// tsx resolves .js → .ts, so this import works both in tsx (dev) and
// after tsc (when importing from dist/).
import { spec } from "../src/openapi/spec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, "../../../dist/apps/opencrane/openapi.json");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(spec, null, 2) + "\n", "utf8");
console.log(`OpenAPI spec written to ${outputPath}`);
