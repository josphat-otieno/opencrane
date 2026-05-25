import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";

import type { NormalizedDocument, SyncCursor } from "./domain/harvesting-agents/harvesting-agent.types.js";
import { _ComputeContentHash } from "./connectors/slack.connector.js";

/**
 * Write a batch of normalized documents into the org knowledge index.
 *
 * Each document is upserted using the (source, sourceId) unique key so that
 * re-ingesting the same document from a cursor replay is safe and idempotent.
 * Content hash comparison is used to skip unchanged documents and avoid
 * unnecessary write amplification.
 *
 * @param prisma    - Prisma client for org_documents table access.
 * @param documents - Batch of normalized documents produced by a connector.
 * @param log       - Scoped logger for ingest diagnostic messages.
 * @returns Ingestion statistics (upserted, skipped, failed counts).
 */
export async function _IngestDocuments(
  prisma: PrismaClient,
  documents: NormalizedDocument[],
  log: Logger,
): Promise<{ upsertedCount: number; skippedCount: number; failedCount: number }>
{
  let upsertedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // 1. Process documents sequentially to avoid overwhelming the database
  //    with a large parallel write burst; batching can be added in Phase 3.
  for (const doc of documents)
  {
    // 2. Compute content hash for deduplication — skip documents whose content
    //    has not changed since the last ingest cycle.
    const contentHash = _ComputeContentHash(doc.content);

    try
    {
      // 3. Look up any existing record to compare content hashes.
      const existing = await (prisma as unknown as { orgDocument: { findUnique: (args: { where: { source_sourceId: { source: string; sourceId: string } } }) => Promise<{ contentHash: string | null } | null> } }).orgDocument.findUnique({
        where: { source_sourceId: { source: doc.source, sourceId: doc.sourceId } },
      });

      if (existing?.contentHash === contentHash)
      {
        skippedCount++;
        continue;
      }

      // 4. Upsert the document — create on first ingest, update if content changed.
      await (prisma as unknown as {
        orgDocument: {
          upsert: (args: {
            where: { source_sourceId: { source: string; sourceId: string } };
            create: object;
            update: object;
          }) => Promise<unknown>;
        };
      }).orgDocument.upsert({
        where: { source_sourceId: { source: doc.source, sourceId: doc.sourceId } },
        create: {
          source: doc.source,
          sourceId: doc.sourceId,
          owner: doc.owner,
          teamScope: doc.teamScope ?? null,
          sensitivityTags: doc.sensitivityTags,
          title: doc.title ?? null,
          content: doc.content,
          contentHash,
          embeddingReady: false,
        },
        update: {
          owner: doc.owner,
          teamScope: doc.teamScope ?? null,
          sensitivityTags: doc.sensitivityTags,
          title: doc.title ?? null,
          content: doc.content,
          contentHash,
          embeddingReady: false,
        },
      });

      upsertedCount++;
    }
    catch (err)
    {
      log.error({ err, source: doc.source, sourceId: doc.sourceId }, "failed to ingest document");
      failedCount++;
    }
  }

  return { upsertedCount, skippedCount, failedCount };
}

/**
 * Load the current sync cursor for a source from the database.
 * Returns null when no cursor has been persisted yet (first sync).
 *
 * @param prisma  - Prisma client for harvesting_cursors table access.
 * @param source  - Logical source name (e.g. "slack").
 * @returns Cursor record or null.
 */
export async function _LoadCursor(prisma: PrismaClient, source: string): Promise<SyncCursor | null>
{
  const row = await (prisma as unknown as {
    harvestingCursor: {
      findUnique: (args: { where: { source: string } }) => Promise<{
        source: string;
        cursorValue: string;
        lastSyncAt: Date;
      } | null>;
    };
  }).harvestingCursor.findUnique({ where: { source } });

  if (!row)
  {
    return null;
  }

  return {
    source: row.source,
    cursorValue: row.cursorValue,
    lastSyncAt: row.lastSyncAt.toISOString(),
  };
}

/**
 * Persist an updated sync cursor after a successful sync cycle.
 *
 * @param prisma      - Prisma client for harvesting_cursors table access.
 * @param source      - Logical source name.
 * @param cursorValue - New cursor value (e.g. latest message timestamp).
 */
export async function _SaveCursor(prisma: PrismaClient, source: string, cursorValue: string): Promise<void>
{
  await (prisma as unknown as {
    harvestingCursor: {
      upsert: (args: {
        where: { source: string };
        create: object;
        update: object;
      }) => Promise<unknown>;
    };
  }).harvestingCursor.upsert({
    where: { source },
    create: { source, cursorValue, lastSyncAt: new Date() },
    update: { cursorValue, lastSyncAt: new Date() },
  });
}
