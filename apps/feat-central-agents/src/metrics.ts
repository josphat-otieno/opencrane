import http from "node:http";

import type { Logger } from "pino";

import type { IngestMetrics, SourceMetrics } from "./domain/harvesting-agents/harvesting-agent.types.js";

/** In-memory metrics store updated after each sync cycle. */
interface MetricsStore
{
  /** Per-source metrics keyed by source name. */
  sources: Map<string, SourceMetrics>;
}

/** Singleton metrics store for the agent process. */
const _metricsStore: MetricsStore = {
  sources: new Map(),
};

/**
 * Update in-memory metrics after a sync cycle completes.
 *
 * @param source         - Logical source name (e.g. "slack").
 * @param upsertedCount  - Documents upserted in this cycle.
 * @param failedCount    - Documents that failed to ingest.
 * @param success        - Whether the cycle completed without fatal errors.
 * @param error          - Error message from a failed cycle, if applicable.
 */
export function _RecordSyncMetrics(
  source: string,
  upsertedCount: number,
  failedCount: number,
  success: boolean,
  error?: string,
): void
{
  const now = new Date();
  const existing = _metricsStore.sources.get(source);

  const totalIngested = (existing?.totalIngested ?? 0) + upsertedCount;
  const lastSyncAt = now.toISOString();
  const lagSeconds = 0; // Reset to 0 after each sync; stale lag is computed on read.

  _metricsStore.sources.set(source, {
    source,
    totalIngested,
    lastSyncAt,
    lagSeconds,
    lastSyncSuccess: success,
    lastError: success ? undefined : error,
  });
}

/**
 * Read a snapshot of current ingest metrics for all sources.
 */
export function _ReadIngestMetrics(): IngestMetrics
{
  const now = new Date();

  const sources: SourceMetrics[] = Array.from(_metricsStore.sources.values()).map(
    function _toSourceMetrics(source)
    {
      const lagSeconds = source.lastSyncAt
        ? Math.max(0, Math.floor((now.getTime() - new Date(source.lastSyncAt).getTime()) / 1000))
        : null;

      return {
        ...source,
        lagSeconds,
      };
    },
  );

  return {
    sampledAt: now.toISOString(),
    sources,
  };
}

/**
 * Start a lightweight HTTP server that exposes `/metrics` and `/healthz` endpoints
 * for the harvesting agent.
 *
 * @param port - TCP port to listen on (default: 9090).
 * @param log  - Scoped logger for server lifecycle events.
 * @returns The created HTTP server instance.
 */
export function _StartMetricsServer(port: number, log: Logger): http.Server
{
  const server = http.createServer(function _handleRequest(req, res)
  {
    // 1. Health check — returns 200 so Kubernetes readiness probes can monitor the agent.
    if (req.method === "GET" && req.url === "/healthz")
    {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // 2. Metrics endpoint — returns JSON ingest metrics for the last sync cycle.
    if (req.method === "GET" && req.url === "/metrics")
    {
      const metrics = _ReadIngestMetrics();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(metrics));
      return;
    }

    // 3. Default — 404 for any unrecognized paths.
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(port, function _onListen()
  {
    log.info({ port }, "feat-central-agents metrics server listening");
  });

  return server;
}
