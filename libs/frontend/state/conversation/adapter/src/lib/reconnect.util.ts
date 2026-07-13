/**
 * Backoff schedule for reconnecting the gateway socket after an unexpected drop.
 *
 * Pure + exported so the curve is unit-tested directly. Exponential from 1s,
 * capped at 15s: 1s, 2s, 4s, 8s, 15s, 15s… The cap keeps a long outage from
 * spacing retries out indefinitely while staying gentle on the broker.
 */

/** First retry delay (ms). */
const _BASE_MS = 1000;

/** Hard cap on the retry delay (ms). */
const _MAX_MS = 15_000;

/**
 * Delay before reconnect attempt `attempt` (0-based).
 *
 * @param attempt - Zero-based retry counter (0 = first retry).
 * @returns The delay in milliseconds, capped at 15s.
 */
export function _ReconnectDelayMs(attempt: number): number
{
	const n = Math.max(0, Math.floor(attempt));
	return Math.min(_BASE_MS * 2 ** n, _MAX_MS);
}
