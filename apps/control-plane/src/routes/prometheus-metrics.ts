import type * as k8s from "@kubernetes/client-node";
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import pino from "pino";

/** Module-level logger for Prometheus metrics error reporting. */
const _log = pino({ name: "prometheus-metrics" });

/**
 * Creates a Prometheus-compatible metrics endpoint for the OpenCrane control plane.
 *
 * Why Prometheus:
 * - Prometheus is the cluster-standard scrape system used by OpenCrane ops dashboards and alerts.
 * - This route emits numeric control-plane health signals that are inexpensive to scrape.
 *
 * What this route reports:
 * - tenant lifecycle distribution (`opencrane_tenants_total`)
 * - org knowledge corpus size (`opencrane_org_documents_total`)
 * - audit log growth (`opencrane_audit_entries_total`)
 * - process uptime and Node heap usage for runtime diagnostics
 *
 * How it connects to the app:
 * - Values are sourced from PostgreSQL via Prisma (tenant/docs/audit state).
 * - The operator and platform monitoring stack scrape this endpoint for alerting and trend dashboards.
 *
 * Exposes these metrics in the Prometheus text exposition format
 * in the Prometheus text exposition format (version 0.0.4).
 *
 * @param prisma    - Prisma ORM client for tenant and drift data.
 * @param customApi - Kubernetes Custom Objects API client for live CRD counts.
 * @returns Configured Express Router mounted at /metrics (Prometheus scrape target).
 */
export function prometheusMetricsRouter(prisma: PrismaClient, customApi: k8s.CustomObjectsApi): Router
{
  const router = Router();

  /**
   * Expose Prometheus-format metrics for scraping by a ServiceMonitor or Prometheus rule.
   */
  router.get("/", async function _getPrometheusMetrics(req, res)
  {
    // 1. Collect tenant phase counts from PostgreSQL for the gauge metrics.
    const tenants = await prisma.tenant.groupBy({
      by: ["phase"],
      _count: { name: true },
    });

    // 2. Collect drift count from the metrics snapshot to expose as a gauge.
    const totalDocuments = await prisma.orgDocument.count().catch(function _handleMissing(err: unknown)
    {
      _log.warn({ err }, "org document count unavailable; returning 0 for Prometheus gauge");
      return 0;
    });

    // 3. Collect audit entry count as a counter proxy.
    const auditEntryCount = await prisma.auditEntry.count();

    // 4. Build Prometheus text format output — one line per metric sample.
    const lines: string[] = [
      "# HELP opencrane_tenants_total Number of tenants by lifecycle phase",
      "# TYPE opencrane_tenants_total gauge",
      ...tenants.map(function _toGaugeLine(row)
      {
        return `opencrane_tenants_total{phase="${row.phase}"} ${row._count.name}`;
      }),

      "",
      "# HELP opencrane_org_documents_total Total documents in the org knowledge index",
      "# TYPE opencrane_org_documents_total gauge",
      `opencrane_org_documents_total ${totalDocuments}`,

      "",
      "# HELP opencrane_audit_entries_total Total audit log entries",
      "# TYPE opencrane_audit_entries_total counter",
      `opencrane_audit_entries_total ${auditEntryCount}`,

      "",
      "# HELP process_uptime_seconds Process uptime in seconds",
      "# TYPE process_uptime_seconds gauge",
      `process_uptime_seconds ${process.uptime().toFixed(3)}`,

      "",
      "# HELP nodejs_heap_used_bytes Node.js V8 heap used bytes",
      "# TYPE nodejs_heap_used_bytes gauge",
      `nodejs_heap_used_bytes ${process.memoryUsage().heapUsed}`,
    ];

    // 5. Respond with Prometheus text format content type so scrapers accept it.
    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(lines.join("\n") + "\n");
  });

  return router;
}
