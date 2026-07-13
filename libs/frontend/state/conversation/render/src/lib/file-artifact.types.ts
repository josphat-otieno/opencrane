/**
 * A file surfaced by a file-bearing tool (a `read` result, or the text a `write`/`edit`
 * wrote) — extracted from the tool's arguments/output so the UI can show a compact file
 * reference and portal the content to a side panel instead of dumping it inline.
 */
export interface FileArtifact
{
	/** Full path from the tool arguments. */
	path: string;
	/** Basename, for the compact tool-row label. */
	name: string;
	/** Content to display — the read output, or the written/edited text. */
	content: string;
	/** highlight.js language id inferred from the extension ("" when unknown). */
	language: string;
}
