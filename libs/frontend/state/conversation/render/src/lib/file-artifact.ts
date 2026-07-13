import { FileArtifact } from "./file-artifact.types";

/**
 * Recognise a file-bearing tool call and pull out the file it operates on so the UI can
 * render a compact reference and portal the content to a side panel (rather than dumping a
 * large `read` result inline). Two shapes are recognised:
 *
 *   - a WRITE/EDIT — arguments carry a path AND the text being written (`content`/`file_text`/
 *     `new_str`/…); the artifact content is that text (the code being written);
 *   - a READ — a read-like tool name with a path argument; the artifact content is the tool
 *     OUTPUT (the file that was read).
 *
 * Anything else (a shell `exec`, a `grep` with a path but a results-shaped output, …) returns
 * null and is rendered inline as before.
 */

/** Extension → highlight.js language id. Extend as needed; unknowns fall back to plain. */
const _EXT_LANG: Record<string, string> = {
	ts: "typescript",
	tsx: "typescript",
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	c: "c",
	h: "c",
	cpp: "cpp",
	cs: "csharp",
	php: "php",
	swift: "swift",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	sql: "sql",
	json: "json",
	yaml: "yaml",
	yml: "yaml",
	toml: "ini",
	ini: "ini",
	xml: "xml",
	html: "xml",
	css: "css",
	scss: "scss",
	less: "less",
	md: "markdown",
	markdown: "markdown"
};

/** The argument keys that carry written text (a write/edit), in priority order. */
const _CONTENT_KEYS = ["content", "file_text", "fileText", "new_str", "new_string", "text"];

/** The argument keys that carry a file path, in priority order. */
const _PATH_KEYS = ["path", "file_path", "filePath", "filename", "file"];

/** The first string-valued property among `keys`, or undefined. */
function _firstString(args: Record<string, unknown>, keys: string[]): string | undefined
{
	for (const key of keys)
	{
		const value = args[key];
		if (typeof value === "string" && value.length > 0)
		{
			return value;
		}
	}
	return undefined;
}

/** Parse a JSON arguments string into an object, or null when it isn't a JSON object. */
function _parseArgs(text: string | undefined): Record<string, unknown> | null
{
	if (!text)
	{
		return null;
	}
	try
	{
		const parsed: unknown = JSON.parse(text);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
	}
	catch
	{
		return null;
	}
}

/** highlight.js language id for a path's extension ("" when unknown). */
function _languageFromPath(path: string): string
{
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	return _EXT_LANG[ext] ?? "";
}

/** The last path segment (basename), or the whole path when unsegmented. */
function _basename(path: string): string
{
	const segments = path.split("/");
	return segments[segments.length - 1] || path;
}

/** Whether a tool name reads a file (its output is the file content). */
function _isReadLike(toolName: string | undefined): boolean
{
	const name = (toolName ?? "").toLowerCase();
	return name.includes("read") || name === "cat" || name === "view" || name.includes("open_file");
}

/**
 * Extract the {@link FileArtifact} a file-bearing tool call operates on, or null when the
 * call is not file-bearing (rendered inline as usual).
 *
 * @param toolName - The tool's name (e.g. `read`, `write`, `edit`).
 * @param argsText - The tool arguments as a JSON string (the tool card's input).
 * @param outputText - The tool result text (the file content, for a read).
 */
export function extractFileArtifact(
	toolName: string | undefined,
	argsText: string | undefined,
	outputText: string | undefined
): FileArtifact | null
{
	const args = _parseArgs(argsText);
	if (!args)
	{
		return null;
	}
	const path = _firstString(args, _PATH_KEYS);
	if (!path)
	{
		return null;
	}
	const written = _firstString(args, _CONTENT_KEYS);
	if (written !== undefined)
	{
		return { path, name: _basename(path), content: written, language: _languageFromPath(path) };
	}
	if (_isReadLike(toolName))
	{
		return { path, name: _basename(path), content: outputText ?? "", language: _languageFromPath(path) };
	}
	return null;
}
