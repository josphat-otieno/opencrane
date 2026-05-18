import pino from "pino";

import type { SlackConnectorConfig } from "./agent.types.js";
import { SlackConnector } from "./connectors/slack.connector.js";
import { _IngestDocuments, _LoadCursor, _SaveCursor } from "./ingestion.js";
import { _RecordSyncMetrics, _StartMetricsServer } from "./metrics.js";

/** Application logger for the harvesting agent. */
const log = pino({ name: "harvesting-agent" });

/**
 * Read and validate Slack connector configuration from the environment.
 * Throws if required variables are missing.
 */
function _ReadSlackConfig(): SlackConnectorConfig
{
  const botToken = process.env.SLACK_BOT_TOKEN ?? "";
  if (!botToken)
  {
    throw new Error("SLACK_BOT_TOKEN environment variable is required");
  }

  const channelList = process.env.SLACK_CHANNEL_IDS ?? "";
  if (!channelList)
  {
    throw new Error("SLACK_CHANNEL_IDS environment variable is required (comma-separated channel IDs)");
  }

  const channelIds = channelList.split(",").map(function _trim(id) { return id.trim(); }).filter(Boolean);

  const maxMessagesPerCycle = Number(process.env.SLACK_MAX_MESSAGES_PER_CYCLE ?? "200");
  const syncIntervalMs = Number(process.env.SLACK_SYNC_INTERVAL_MS ?? "900000"); // 15 minutes default

  return {
    botToken,
    channelIds,
    maxMessagesPerCycle,
    syncIntervalMs,
  };
}

/**
 * Read and validate the control-plane PostgreSQL URL from the environment.
 * Returns the DATABASE_URL needed by Prisma.
 */
function _ReadDatabaseUrl(): string
{
  const url = process.env.DATABASE_URL ?? "";
  if (!url)
  {
    throw new Error("DATABASE_URL environment variable is required");
  }

  return url;
}

/**
 * Run a single Slack sync cycle: load cursor, fetch messages, ingest, save cursor.
 *
 * @param connector - Slack connector instance.
 * @param prisma    - Prisma client for org index and cursor table access.
 */
async function _RunSlackSyncCycle(
  connector: SlackConnector,
  prisma: { orgDocument: unknown; harvestingCursor: unknown; auditEntry: unknown },
): Promise<void>
{
  const source = "slack";
  log.info({ source }, "starting sync cycle");

  // 1. Load the persisted cursor from the last successful sync.
  const cursor = await _LoadCursor(prisma as never, source);

  // 2. Fetch new messages from Slack since the cursor timestamp.
  const { documents, nextCursor, errors } = await connector.sync(cursor);

  log.info({ source, documentCount: documents.length, errors: errors.length }, "sync fetched documents");

  // 3. Ingest normalized documents into the org knowledge index.
  const { upsertedCount, skippedCount, failedCount } = await _IngestDocuments(
    prisma as never,
    documents,
    log,
  );

  // 4. Advance the cursor to the latest message timestamp if progress was made.
  if (nextCursor)
  {
    await _SaveCursor(prisma as never, source, nextCursor);
  }

  // 5. Record metrics for this cycle so the metrics server can serve them.
  const hasErrors = errors.length > 0 || failedCount > 0;
  _RecordSyncMetrics(source, upsertedCount, failedCount, !hasErrors, errors[0]);

  log.info({ source, upsertedCount, skippedCount, failedCount, nextCursor }, "sync cycle complete");
}

/**
 * Main entry point for the harvesting agent.
 *
 * Starts the metrics server, initializes connectors from environment config,
 * and runs an incremental sync loop at the configured interval.
 */
async function _Main(): Promise<void>
{
  // 1. Read configuration — fail fast on missing required env vars.
  const slackConfig = _ReadSlackConfig();
  _ReadDatabaseUrl();

  // 2. Start the metrics/health HTTP server so k8s probes work immediately.
  const metricsPort = Number(process.env.METRICS_PORT ?? "9090");
  _StartMetricsServer(metricsPort, log);

  // 3. Initialize the Prisma client for the org index and cursor tables.
  //    Dynamic import used because prisma generate is a dev-time step.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  // 4. Initialize the Slack connector with the resolved configuration.
  const slackConnector = new SlackConnector(slackConfig, log);

  log.info(
    { channelIds: slackConfig.channelIds, intervalMs: slackConfig.syncIntervalMs },
    "harvesting agent started — Slack connector active",
  );

  // 5. Run the first sync cycle immediately on startup, then repeat at the configured interval.
  await _RunSlackSyncCycle(slackConnector, prisma as never);

  setInterval(async function _syncTick()
  {
    try
    {
      await _RunSlackSyncCycle(slackConnector, prisma as never);
    }
    catch (err)
    {
      log.error({ err }, "sync cycle failed; will retry next interval");
      _RecordSyncMetrics("slack", 0, 0, false, err instanceof Error ? err.message : String(err));
    }
  }, slackConfig.syncIntervalMs);
}

_Main().catch(function _onError(err: unknown)
{
  log.error({ err }, "harvesting agent crashed");
  process.exit(1);
});
