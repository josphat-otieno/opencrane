import type { Types } from "@a2ui/angular/v0_8";

/** A2UI server→client action message (createSurface / surfaceUpdate / …). */
type ServerToClientMessage = Types.ServerToClientMessage;

/**
 * Parse A2UI transport into the server→client action messages the renderer consumes.
 *
 * A2UI streams actions as JSONL (one JSON object per line: `createSurface`, `surfaceUpdate`,
 * `dataModelUpdate`, `beginRendering`, `deleteSurface`, …) — but a payload may also arrive as a
 * single JSON array of those actions, or already-parsed objects. This is tolerant of all three
 * and skips blank lines / unparseable lines; schema validation is the MessageProcessor's job.
 *
 * @param raw - A JSONL string, a JSON array string, or an already-parsed array of actions.
 * @returns The parsed action objects (unknown-shaped; validated downstream).
 */
export function _ParseA2uiMessages(raw: unknown): ServerToClientMessage[]
{
	if (Array.isArray(raw))
	{
		return raw.filter(_isObject) as ServerToClientMessage[];
	}
	if (typeof raw !== "string")
	{
		return [];
	}
	const trimmed = raw.trim();
	if (!trimmed)
	{
		return [];
	}
	// Whole-payload JSON array first (the batched form).
	if (trimmed.startsWith("["))
	{
		try
		{
			const parsed = JSON.parse(trimmed);
			return Array.isArray(parsed) ? (parsed.filter(_isObject) as ServerToClientMessage[]) : [];
		}
		catch
		{
			// Fall through to line-by-line (a `[` line inside JSONL is unusual but tolerated).
		}
	}
	// JSONL: one action per non-blank line.
	const out: ServerToClientMessage[] = [];
	for (const line of trimmed.split("\n"))
	{
		const l = line.trim();
		if (!l)
		{
			continue;
		}
		try
		{
			const parsed = JSON.parse(l);
			if (_isObject(parsed))
			{
				out.push(parsed as ServerToClientMessage);
			}
		}
		catch
		{
			// Skip a malformed line rather than dropping the whole stream.
		}
	}
	return out;
}

/** Whether a value is a non-null, non-array object. */
function _isObject(value: unknown): value is Record<string, unknown>
{
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
