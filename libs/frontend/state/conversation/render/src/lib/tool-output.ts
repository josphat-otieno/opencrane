/*
 * Self-contained tool-output helpers — the pure, dependency-free functions extracted from
 * OpenClaw's `ui/src/ui/chat/tool-cards.ts` (whose full `extractToolCards` pulls a deep
 * server tail we deliberately do NOT vendor). Our gateway extractor pairs tool calls with
 * their results directly; these helpers classify the output (error?) and tidy the collapsed
 * summary, and mirror upstream's detection so error styling matches.
 *
 * Derived from openclaw@v2026.6.11. MIT — Copyright (c) 2026 OpenClaw Foundation.
 * See THIRD_PARTY_NOTICES.md.
 */
const TOOL_NOT_FOUND_PATTERN = /^tool not found\.?$/i;
const MAX_ERROR_DETECT_CHARS = 20_000;
const TOOL_ERROR_STATUSES = new Set(["error", "failed", "timeout"]);

function hasToolErrorStatus(value: unknown): boolean
{
	return typeof value === "string" && TOOL_ERROR_STATUSES.has(value.trim().toLowerCase());
}

function readToolErrorFlag(value: Record<string, unknown>): boolean | undefined
{
	const raw = value["isError"] ?? value["is_error"];
	return typeof raw === "boolean" ? raw : undefined;
}

/** Whether a tool's output text signals an error (explicit flag, `error` field, or error status). */
export function isToolErrorOutput(outputText: string | undefined): boolean
{
	if (!outputText)
	{
		return false;
	}
	const trimmed = outputText.trim();
	if (!trimmed)
	{
		return false;
	}
	if (TOOL_NOT_FOUND_PATTERN.test(trimmed))
	{
		return true;
	}
	if (trimmed.length > MAX_ERROR_DETECT_CHARS)
	{
		return false;
	}
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}"))
	{
		return false;
	}
	let parsed: unknown;
	try
	{
		parsed = JSON.parse(trimmed);
	}
	catch
	{
		return false;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
	{
		return false;
	}
	const obj = parsed as Record<string, unknown>;
	const explicitErrorFlag = readToolErrorFlag(obj);
	if (explicitErrorFlag !== undefined)
	{
		return explicitErrorFlag;
	}
	if ("error" in obj)
	{
		const value = obj["error"];
		if (typeof value === "string")
		{
			return value.trim().length > 0;
		}
		if (typeof value === "boolean")
		{
			return value;
		}
		if (value && typeof value === "object")
		{
			return true;
		}
	}
	return hasToolErrorStatus(obj["status"]);
}

/** Tidies a tool-call argument preview for the collapsed chip (drops a leading "with "). */
function formatCollapsedToolSummaryText(value: string | undefined): string | undefined
{
	const normalized = value?.trim().replace(/\s+/g, " ");
	if (!normalized)
	{
		return undefined;
	}
	const withoutConnector = normalized.replace(/^with\s+/i, "").trim();
	return withoutConnector || normalized;
}

/** The collapsed summary, capped to a chip-friendly length. */
export function formatCollapsedToolPreviewText(value: string | undefined): string | undefined
{
	const normalized = formatCollapsedToolSummaryText(value);
	if (!normalized)
	{
		return undefined;
	}
	return normalized.slice(0, 120);
}
