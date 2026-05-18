import { createHash } from "node:crypto";

import type { Logger } from "pino";

import type { NormalizedDocument, SlackConnectorConfig, SyncCursor, SyncResult } from "../agent.types.js";

/** Slack conversations.history API response shape (minimal). */
interface SlackHistoryResponse
{
  /** Whether the API call succeeded. */
  ok: boolean;
  /** Messages returned by the API. */
  messages?: SlackMessage[];
  /** Whether there are more messages to fetch. */
  has_more?: boolean;
  /** Opaque cursor for the next page. */
  response_metadata?: { next_cursor?: string };
}

/** Minimal Slack message shape used for normalization. */
interface SlackMessage
{
  /** Message type — only "message" subtypes are harvested. */
  type: string;
  /** Slack user ID of the sender. */
  user?: string;
  /** Plain-text message body. */
  text?: string;
  /** Slack message timestamp (seconds.microseconds). */
  ts: string;
}

/**
 * Slack source connector for the harvesting agent.
 *
 * Implements cursor-based incremental sync using the Slack
 * `conversations.history` API. On each sync cycle it fetches messages
 * posted since the last recorded cursor (latest message timestamp) and
 * normalizes them to {@link NormalizedDocument} records ready for ingestion
 * into the org knowledge index.
 */
export class SlackConnector
{
  /** Connector configuration injected at construction time. */
  private readonly _config: SlackConnectorConfig;

  /** Scoped logger for this connector. */
  private readonly _log: Logger;

  /**
   * Construct a new SlackConnector.
   * @param config - Slack connector configuration including token and channel IDs.
   * @param log    - Scoped pino logger.
   */
  constructor(config: SlackConnectorConfig, log: Logger)
  {
    this._config = config;
    this._log = log.child({ connector: "slack" });
  }

  /**
   * Run a single incremental sync cycle across all configured channels.
   *
   * Fetches messages posted since the cursor timestamp, normalizes each
   * message to an {@link NormalizedDocument}, and returns the full batch
   * along with the next cursor value to persist.
   *
   * @param cursor - Optional previous sync cursor. When absent, fetches the
   *                 most recent messages up to {@link SlackConnectorConfig.maxMessagesPerCycle}.
   * @returns Tuple of [normalized documents, next cursor, any per-message errors].
   */
  async sync(cursor: SyncCursor | null): Promise<{ documents: NormalizedDocument[]; nextCursor: string | null; errors: string[] }>
  {
    const documents: NormalizedDocument[] = [];
    const errors: string[] = [];
    let latestTs: string | null = null;

    // 1. Iterate over each configured channel — each produces a batch of messages.
    for (const channelId of this._config.channelIds)
    {
      // 2. Fetch history for this channel starting from the last cursor timestamp.
      const result = await this._fetchChannelMessages(channelId, cursor?.cursorValue ?? null);

      if (!result.success)
      {
        this._log.warn({ channelId, error: result.error }, "failed to fetch channel history");
        errors.push(`channel ${channelId}: ${result.error}`);
        continue;
      }

      // 3. Normalize each message into a canonical NormalizedDocument.
      for (const message of result.messages ?? [])
      {
        const doc = this._normalizeMessage(channelId, message);
        if (doc)
        {
          documents.push(doc);

          // 4. Track the latest message timestamp to advance the cursor.
          if (!latestTs || message.ts > latestTs)
          {
            latestTs = message.ts;
          }
        }
      }
    }

    return { documents, nextCursor: latestTs, errors };
  }

  /**
   * Fetch messages from a single Slack channel since the given oldest timestamp.
   */
  private async _fetchChannelMessages(
    channelId: string,
    oldest: string | null,
  ): Promise<{ success: boolean; messages?: SlackMessage[]; error?: string }>
  {
    // 1. Build the conversations.history query parameters.
    const params = new URLSearchParams({
      channel: channelId,
      limit: String(this._config.maxMessagesPerCycle),
      ...(oldest ? { oldest } : {}),
    });

    // 2. Call the Slack Web API — use the Bot token for authentication.
    let response: Response;
    try
    {
      response = await fetch(`https://slack.com/api/conversations.history?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${this._config.botToken}`,
          "Content-Type": "application/json",
        },
      });
    }
    catch (err)
    {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `fetch error: ${message}` };
    }

    // 3. Parse the JSON body and check the Slack ok flag.
    let body: SlackHistoryResponse;
    try
    {
      body = await response.json() as SlackHistoryResponse;
    }
    catch (err)
    {
      return { success: false, error: "failed to parse Slack API response as JSON" };
    }

    if (!body.ok)
    {
      return { success: false, error: `Slack API error: ${JSON.stringify(body)}` };
    }

    return { success: true, messages: body.messages ?? [] };
  }

  /**
   * Normalize a Slack message into a {@link NormalizedDocument}.
   * Returns null for system messages, bot messages without text, or empty messages.
   */
  private _normalizeMessage(channelId: string, message: SlackMessage): NormalizedDocument | null
  {
    // 1. Skip non-user messages (system events, bot messages without text).
    if (!message.text || message.text.trim() === "")
    {
      return null;
    }

    // 2. Build a stable source ID from channel + timestamp — unique per message.
    const sourceId = `${channelId}/${message.ts}`;

    // 3. Classify sensitivity — apply "slack" sensitivity tag to all messages.
    //    Fine-grained sensitivity classification is a Phase 3 feature.
    const sensitivityTags = ["slack"];

    return {
      source: "slack",
      sourceId,
      owner: message.user ?? "unknown",
      sensitivityTags,
      content: message.text,
    };
  }
}

/**
 * Compute a stable SHA-256 content hash for deduplication purposes.
 * @param content - Raw document content string.
 * @returns Hex-encoded SHA-256 digest.
 */
export function _ComputeContentHash(content: string): string
{
  return createHash("sha256").update(content, "utf8").digest("hex");
}
