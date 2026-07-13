import { SessionOperationEvent } from "./gateway-protocol.types";

/**
 * Pure readers over a `session.operation` event. Kept out of the gateway and
 * exported so the label/terminal rules are unit-tested directly.
 */

/** Statuses that mean the operation has finished and its status line should clear. */
const _TERMINAL = new Set(["done", "complete", "completed", "finished", "error", "failed", "cancelled", "canceled", "aborted"]);

/**
 * A human-readable status line for a running operation, or `undefined` when the
 * event carries nothing worth showing. Prefers an explicit `label`, then a
 * title-cased `operation`/`kind`, optionally suffixed with a non-terminal `phase`.
 */
export function _OperationLabel(ev: SessionOperationEvent): string | undefined
{
	const base = _firstString(ev.label, _titleCase(ev.operation), _titleCase(ev.kind));
	if (!base)
	{
		return undefined;
	}
	const phase = typeof ev.phase === "string" && ev.phase.trim().length > 0 && !_TERMINAL.has(ev.phase.toLowerCase())
		? ev.phase.trim()
		: undefined;
	return phase ? `${base} — ${phase}` : base;
}

/**
 * Whether the event marks the operation as finished — an explicit `done: true`,
 * or a terminal `status`/`phase` (done/complete/error/cancelled/…). The caller
 * clears the inline status line when this is true.
 */
export function _OperationIsTerminal(ev: SessionOperationEvent): boolean
{
	if (ev.done === true)
	{
		return true;
	}
	return _isTerminalWord(ev.status) || _isTerminalWord(ev.phase);
}

/** Whether a status word is in the terminal set (case-insensitive). */
function _isTerminalWord(value: string | undefined): boolean
{
	return typeof value === "string" && _TERMINAL.has(value.toLowerCase());
}

/** First non-empty trimmed string among the candidates. */
function _firstString(...values: (string | undefined)[]): string | undefined
{
	for (const value of values)
	{
		if (typeof value === "string" && value.trim().length > 0)
		{
			return value.trim();
		}
	}
	return undefined;
}

/** Title-case a dotted/underscored operation id ("context.compaction" → "Context compaction"). */
function _titleCase(value: string | undefined): string | undefined
{
	if (typeof value !== "string" || value.trim().length === 0)
	{
		return undefined;
	}
	const words = value.trim().replace(/[._-]+/g, " ").split(/\s+/);
	return words.map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" ");
}
