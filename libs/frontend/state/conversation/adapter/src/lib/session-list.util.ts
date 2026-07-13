import { SessionSummary } from "@opencrane/core";

/** Default accent colour applied when a row carries no colour. */
const _DEFAULT_COLOR = "#7A6AA0";

/** Default department key applied when a row carries no department. */
const _DEFAULT_DEPT = "general";

/** Default owning pod applied when a row carries no pod. */
const _DEFAULT_POD = "—";

/**
 * Map a gateway session-list payload onto `SessionSummary[]` for the sidebar.
 *
 * Row shape verified against openclaw@2026.6.9 (`sessions.list` →
 * `{ sessions: [{ key, label, sessionId, scope, updatedAt, … }] }`): the id used
 * to open/subscribe/history a session is **`key`** (NOT `id`/`sessionId`), and the
 * display name is **`label`**. The mapper stays defensive — it also accepts the
 * older `id`/`name`/`title` aliases, defaults colour/dept/pod, treats every row as
 * the caller's (single-owner pod), and drops any row without a usable id. Rows are
 * returned most-recent first. Pure and DI-free so it can be unit-tested directly.
 *
 * @param raw Untrusted payload from the gateway's `sessions.list` response.
 * @returns Normalised session summaries; an empty array for a non-array input.
 */
export function _MapSessionSummaries(raw: unknown): SessionSummary[]
{
	if (!Array.isArray(raw))
	{
		return [];
	}
	// Newest first — the gateway does not guarantee order.
	const rows = [...raw].sort((a, b) => _UpdatedAt(b) - _UpdatedAt(a));
	const mapped: SessionSummary[] = [];
	for (const entry of rows)
	{
		const summary = _MapRow(entry);
		if (summary)
		{
			mapped.push(summary);
		}
	}
	return mapped;
}

/** Read a row's `updatedAt`/`mtime` epoch for sorting; 0 when absent. */
function _UpdatedAt(entry: unknown): number
{
	if (!entry || typeof entry !== "object")
	{
		return 0;
	}
	const value = (entry as Record<string, unknown>)["updatedAt"] ?? (entry as Record<string, unknown>)["mtime"];
	if (typeof value === "number")
	{
		return value;
	}
	if (typeof value === "string")
	{
		const ms = Date.parse(value);
		return Number.isNaN(ms) ? 0 : ms;
	}
	return 0;
}

/**
 * Map a single untrusted row to a `SessionSummary`, or `null` to drop it.
 *
 * @param entry One element of the gateway session-list payload.
 * @returns A normalised summary, or `null` when the row has no usable id.
 */
function _MapRow(entry: unknown): SessionSummary | null
{
	if (!entry || typeof entry !== "object")
	{
		return null;
	}
	const row = entry as Record<string, unknown>;
	// `key` is the canonical session key openclaw uses to open/subscribe/history a
	// session; fall back to the older aliases only when it is absent.
	const id = _Str(row["key"]) ?? _Str(row["id"]) ?? _Str(row["sessionId"]);
	if (!id)
	{
		return null;
	}
	const name = _Str(row["label"]) ?? _Str(row["name"]) ?? _Str(row["title"]) ?? id;
	return {
		id,
		name,
		color: _Str(row["color"]) ?? _DEFAULT_COLOR,
		dept: _Str(row["dept"]) ?? _DEFAULT_DEPT,
		subtitle: _Str(row["subtitle"]),
		unread: typeof row["unread"] === "number" ? row["unread"] : undefined,
		// The pod is pinned to one owner (CONN.10), so every session it returns is the
		// caller's — default `mine` true unless a row explicitly marks itself shared.
		mine: row["mine"] !== false,
		pod: _Str(row["pod"]) ?? _DEFAULT_POD
	};
}

/**
 * Coerce a value to a non-empty trimmed string, or `undefined`.
 *
 * @param value Candidate field value from a raw row.
 * @returns The trimmed string when non-empty, otherwise `undefined`.
 */
function _Str(value: unknown): string | undefined
{
	if (typeof value !== "string")
	{
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}
