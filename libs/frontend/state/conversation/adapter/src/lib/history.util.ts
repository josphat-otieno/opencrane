import { ThreadMessage } from "@opencrane/core";

/**
 * Pure helpers for the history-window logic, factored out of the gateway so the
 * exhaustion and live-tail-merge rules can be unit-tested without Angular DI.
 */

/**
 * Rebuild the visible transcript after a history fetch: the freshly-fetched
 * server rows followed by any locally-originated tail messages (optimistic
 * sends, the in-flight stream) that are not yet part of the server transcript.
 *
 * Local messages are identified by explicit id membership — never by guessing
 * from the id string, since the server owns history-row ids and could collide
 * with any prefix heuristic.
 *
 * @param fetched  - Mapped server history rows (oldest→newest).
 * @param current  - The transcript currently on screen.
 * @param localIds - Ids of messages minted locally and not yet persisted.
 */
export function _MergeLiveTail(fetched: ThreadMessage[], current: ThreadMessage[], localIds: ReadonlySet<string>): ThreadMessage[]
{
	const tail = current.filter(function isLocalTail(message: ThreadMessage): boolean
	{
		return localIds.has(message.id);
	});
	return [...fetched, ...tail];
}

/**
 * Decide whether the history window has reached the start of the transcript.
 *
 * Robust to the gateway's `maxChars` truncation: rather than treating "fewer
 * rows than the limit" as the end (which truncation can trigger spuriously),
 * the window is exhausted only when growing the limit revealed no additional
 * rows (`rowCount === lastRowCount`) or the hard ceiling has been reached.
 *
 * @param rowCount     - Rows returned by this fetch.
 * @param lastRowCount - Rows returned by the previous fetch (-1 if first).
 * @param limit        - The window size used for this fetch.
 * @param maxLimit     - The gateway's hard window ceiling.
 */
export function _IsHistoryExhausted(rowCount: number, lastRowCount: number, limit: number, maxLimit: number): boolean
{
	return rowCount === lastRowCount || limit >= maxLimit;
}
