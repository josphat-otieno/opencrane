/**
 * OpenTelemetry bootstrap for the feat-skill-registry.
 *
 * Imported first in `index.ts` (and preloaded via `node --import` in the
 * container) so the SDK patches `http`/`express`/`fetch` before any
 * instrumented module loads. Keep tiny and dependency-light.
 */
import { ___StartTelemetry } from "@opencrane/observability/telemetry";

await ___StartTelemetry({ serviceName: "feat-skill-registry", serviceVersion: process.env["npm_package_version"] ?? "0.1.0" });
