/*
 * Text helpers the markdown pipeline needs, ported from OpenClaw sources that live in
 * unpublished/deep locations (`src/shared/text/citation-control-markers.ts`, `ui/src/ui/format.ts`).
 *
 * Derived from openclaw@v2026.6.11. MIT — Copyright (c) 2026 OpenClaw Foundation.
 * See THIRD_PARTY_NOTICES.md.
 */

const UNSUPPORTED_CITATION_CONTROL_MARKER_RE = /cite(?:[^]*)?/g;
const TRAILING_UNSUPPORTED_CITATION_CONTROL_MARKER_RE = /[ \t]*cite(?:[^]*)?(?=\r?\n|$)/g;

/** Removes unsupported model citation-control markers without disturbing normal hard breaks. */
export function stripUnsupportedCitationControlMarkers(text: string): string
{
	return text
		.replace(TRAILING_UNSUPPORTED_CITATION_CONTROL_MARKER_RE, "")
		.replace(UNSUPPORTED_CITATION_CONTROL_MARKER_RE, "");
}

/** Caps a string to `max` chars, reporting whether it was cut and the original length. */
export function truncateText(value: string, max: number): { text: string; truncated: boolean; total: number }
{
	if (value.length <= max)
	{
		return { text: value, truncated: false, total: value.length };
	}
	return {
		text: value.slice(0, Math.max(0, max)),
		truncated: true,
		total: value.length,
	};
}
