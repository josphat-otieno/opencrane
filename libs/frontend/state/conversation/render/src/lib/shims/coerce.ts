/*
 * Shim for OpenClaw's unpublished `@openclaw/normalization-core` workspace helpers.
 *
 * The vendored render slice imports a handful of tiny coercion utilities from
 * `@openclaw/normalization-core/{string-coerce,number-coercion,record-coerce}` — packages
 * that are `workspace:*` in the OpenClaw monorepo and are NOT published to npm. Rather than
 * take an unbuildable dependency, the exact functions the vendored files use are ported here
 * verbatim. Faithful to openclaw@v2026.6.11.
 *
 * Portions derived from OpenClaw (MIT) — Copyright (c) 2026 OpenClaw Foundation.
 * See THIRD_PARTY_NOTICES.md.
 */

/** Type guard for non-array object records at browser-safe boundaries. */
export function isRecord(value: unknown): value is Record<string, unknown>
{
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Returns a non-array record or undefined. */
export function asOptionalRecord(value: unknown): Record<string, unknown> | undefined
{
	return isRecord(value) ? value : undefined;
}

/** Coerces a finite number, else undefined. */
export function asFiniteNumber(value: unknown): number | undefined
{
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Trims string input and returns undefined for non-strings or empty strings. */
export function normalizeOptionalString(value: unknown): string | undefined
{
	if (typeof value !== "string")
	{
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

/** Lowercases a normalized optional string. */
export function normalizeOptionalLowercaseString(value: unknown): string | undefined
{
	return normalizeOptionalString(value)?.toLowerCase();
}

/** Lowercases a normalized string or returns an empty string when absent. */
export function normalizeLowercaseStringOrEmpty(value: unknown): string
{
	return normalizeOptionalLowercaseString(value) ?? "";
}
