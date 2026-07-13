/*
 * Markdown → sanitized HTML pipeline — vendored from OpenClaw (`ui/src/ui/markdown.ts`).
 *
 * markdown-it (GFM: strikethrough, www-only linkify, task lists) + highlight.js (14 languages)
 * + DOMPurify with an explicit tag/attr allowlist. Code fences get a copy button and JSON
 * collapses into a <details>; images are restricted to base64 data URIs; raw HTML is escaped
 * (only the task-list checkbox <input> from our own plugin is trusted); anchors are hardened
 * (host-local file hrefs and dangerous schemes stripped, rel/target set). 140k char limit +
 * a 40k parse guard + a 200-entry LRU cache.
 *
 * Divergence from upstream: OpenClaw's docs-link rewriting (bare `/foo` → docs.openclaw.ai) and
 * its control-ui route/resource detection are NOT vendored — that is OpenClaw-product coupling
 * we don't want; the `i18n` copy-button labels are inlined in English. The security posture
 * (allowlist, scheme/host-local blocking, HTML escaping) is preserved verbatim.
 *
 * Derived from openclaw@v2026.6.11. MIT — Copyright (c) 2026 OpenClaw Foundation.
 * See THIRD_PARTY_NOTICES.md.
 */
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import MarkdownIt from "markdown-it";
// markdown-it-task-lists ships no types and has no @types package. It resolves to an untyped
// JS module, so it can't be augmented with `declare module`, and a sibling .d.ts is not in the
// app AOT build's program — the portable fix is to suppress the implicit-any on the import here.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error markdown-it-task-lists has no type declarations
import markdownItTaskLists from "markdown-it-task-lists";

import { normalizeLowercaseStringOrEmpty } from "./shims/coerce";
import { stripUnsupportedCitationControlMarkers, truncateText } from "./shims/text";

// Copy-button labels (upstream reads these from i18n; WeOwnAI renders one locale for now).
const COPY_CODE_ARIA = "Copy code";
const COPY_IDLE = "Copy";
const COPY_DONE = "Copied";

const allowedTags = [
	"a",
	"b",
	"blockquote",
	"br",
	"button",
	"code",
	"del",
	"details",
	"div",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"hr",
	"i",
	"input",
	"li",
	"ol",
	"p",
	"pre",
	"s",
	"span",
	"strong",
	"summary",
	"table",
	"tbody",
	"td",
	"th",
	"thead",
	"tr",
	"ul",
	"img",
];

const allowedAttrs = [
	"checked",
	"class",
	"disabled",
	"href",
	"rel",
	"target",
	"title",
	"start",
	"src",
	"alt",
	"data-code",
	"type",
	"aria-label",
];
const sanitizeOptions = {
	ALLOWED_TAGS: allowedTags,
	ALLOWED_ATTR: allowedAttrs,
	ADD_DATA_URI_TAGS: ["img"],
};

let hooksInstalled = false;
const MARKDOWN_CHAR_LIMIT = 140_000;
const MARKDOWN_PARSE_LIMIT = 40_000;
const MARKDOWN_CACHE_LIMIT = 200;
const MARKDOWN_CACHE_MAX_CHARS = 50_000;
const INLINE_DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;
const HOST_LOCAL_FILE_HREF_RE =
	/^(?:~\/|\/(?:Users|home|tmp|private\/tmp|var\/folders|private\/var\/folders)\/|\/[A-Za-z]:\/|[A-Za-z]:[\\/])/;
const markdownCache = new Map<string, string>();
const TAIL_LINK_BLUR_CLASS = "chat-link-tail-blur";
const FENCE_OPEN_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const FENCE_CONTAINER_PREFIX_RE = /^[ \t]{0,3}(?:(?:>\s?)|(?:(?:[-+*]|\d{1,9}[.)])[ \t]+))/;

export type MarkdownCodeBlockChrome = "copy" | "none";

export type MarkdownRenderOptions = {
	codeBlockChrome?: MarkdownCodeBlockChrome;
};

type MarkdownRenderEnv = {
	codeBlockChrome: MarkdownCodeBlockChrome;
};

// CJK character ranges for URL boundary detection (RFC 3986: CJK is not valid in raw URLs).
const CJK_RE = new RegExp(
	"[\\u2E80-\\u2FFF\\u3000-\\u303F\\u3040-\\u309F\\u30A0-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF\\uFF01-\\uFF60]",
);

function getCachedMarkdown(key: string): string | null
{
	const cached = markdownCache.get(key);
	if (cached === undefined)
	{
		return null;
	}
	markdownCache.delete(key);
	markdownCache.set(key, cached);
	return cached;
}

function setCachedMarkdown(key: string, value: string)
{
	markdownCache.set(key, value);
	if (markdownCache.size <= MARKDOWN_CACHE_LIMIT)
	{
		return;
	}
	const oldest = markdownCache.keys().next().value;
	if (oldest)
	{
		markdownCache.delete(oldest);
	}
}

function normalizeMarkdownRenderOptions(options: MarkdownRenderOptions = {}): MarkdownRenderEnv
{
	return {
		codeBlockChrome: options.codeBlockChrome ?? "copy",
	};
}

function shouldRenderCodeBlockCopy(env: unknown): boolean
{
	return (env as Partial<MarkdownRenderEnv> | undefined)?.codeBlockChrome !== "none";
}

function isHostLocalFileHref(href: string): boolean
{
	return HOST_LOCAL_FILE_HREF_RE.test(href.trim());
}

function installHooks()
{
	if (hooksInstalled)
	{
		return;
	}
	hooksInstalled = true;

	DOMPurify.addHook("afterSanitizeAttributes", (node) =>
	{
		if (!(node instanceof HTMLAnchorElement))
		{
			return;
		}
		const href = node.getAttribute("href");
		if (!href)
		{
			return;
		}

		// Never link a host-local filesystem path (e.g. /Users/…, ~/…, C:\…).
		if (isHostLocalFileHref(href))
		{
			node.removeAttribute("href");
			return;
		}

		// Block dangerous URL schemes (javascript:, data:, vbscript:, …). DOMPurify already
		// strips javascript: by default; this is defense-in-depth.
		try
		{
			const base = typeof window !== "undefined" ? window.location.href : "http://localhost/";
			const url = new URL(href, base);
			if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:")
			{
				node.removeAttribute("href");
				return;
			}
		}
		catch
		{
			// Relative/malformed URLs keep their href; the allowlist + default scheme
			// stripping are the safety net.
		}

		node.setAttribute("rel", "noreferrer noopener");
		node.setAttribute("target", "_blank");
		if (normalizeLowercaseStringOrEmpty(href).includes("tail"))
		{
			node.classList.add(TAIL_LINK_BLUR_CLASS);
		}
	});
}

// ── markdown-it instance with custom renderers ──

function escapeHtml(value: string): string
{
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function normalizeMarkdownImageLabel(text?: string | null): string
{
	const trimmed = text?.trim();
	return trimmed ? trimmed : "image";
}

function normalizeMarkdownInput(markdownLocal: string): string
{
	const input = _expandAgentComponents(stripUnsupportedCitationControlMarkers(markdownLocal)).trim();
	if (!input)
	{
		return "";
	}
	const truncated = truncateText(input, MARKDOWN_CHAR_LIMIT);
	const suffix = truncated.truncated
		? `\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`
		: "";
	return `${truncated.text}${suffix}`.replace(/\r\n?/g, "\n");
}

function getFenceMarker(line: string): { marker: "`" | "~"; length: number } | null
{
	const match = FENCE_OPEN_RE.exec(stripFenceContainerPrefixes(line));
	if (!match)
	{
		return null;
	}
	const fence = match[1];
	const marker = fence[0] as "`" | "~";
	return { marker, length: fence.length };
}

function stripFenceContainerPrefixes(line: string): string
{
	let current = line;
	for (let index = 0; index < 8; index += 1)
	{
		const next = current.replace(FENCE_CONTAINER_PREFIX_RE, "");
		if (next === current)
		{
			return current;
		}
		current = next;
	}
	return current;
}

function isFenceClose(line: string, fence: { marker: "`" | "~"; length: number }): boolean
{
	const trimmed = stripFenceContainerPrefixes(line).trimEnd();
	const match = FENCE_OPEN_RE.exec(trimmed);
	if (!match)
	{
		return false;
	}
	const marker = match[1][0];
	if (marker !== fence.marker || match[1].length < fence.length)
	{
		return false;
	}
	return trimmed.slice(match[0].length).trim() === "";
}

function findStableStreamingMarkdownBoundary(markdownLocal: string): number
{
	let boundary = 0;
	let index = 0;
	let openFence: { marker: "`" | "~"; length: number } | null = null;

	while (index < markdownLocal.length)
	{
		const nextLineBreak = markdownLocal.indexOf("\n", index);
		const lineEnd = nextLineBreak === -1 ? markdownLocal.length : nextLineBreak + 1;
		const line = markdownLocal.slice(index, nextLineBreak === -1 ? lineEnd : nextLineBreak);

		if (openFence)
		{
			if (isFenceClose(line, openFence))
			{
				openFence = null;
				boundary = lineEnd;
			}
			index = lineEnd;
			continue;
		}

		const openingFence = getFenceMarker(line);
		if (openingFence)
		{
			openFence = openingFence;
			index = lineEnd;
			continue;
		}

		if (line.trim() === "")
		{
			boundary = lineEnd;
		}
		index = lineEnd;
	}

	return boundary;
}

for (const [language, definition, aliases] of [
	["bash", bash, ["sh", "shell"]],
	["cpp", cpp, ["c++", "cxx"]],
	["css", css, []],
	["diff", diff, ["patch"]],
	["go", go, ["golang"]],
	["java", java, []],
	["javascript", javascript, ["js", "jsx"]],
	["json", json, []],
	["markdown", markdown, ["md"]],
	["python", python, ["py"]],
	["rust", rust, ["rs"]],
	["typescript", typescript, ["ts", "tsx"]],
	["xml", xml, ["html", "svg"]],
	["yaml", yaml, ["yml"]],
] as const)
{
	hljs.registerLanguage(language, definition);
	if (aliases.length > 0)
	{
		hljs.registerAliases([...aliases], { languageName: language });
	}
}

function normalizeHighlightLanguage(lang: string): string
{
	const normalized = lang.trim().toLowerCase();
	if (!normalized)
	{
		return "";
	}
	const aliases: Record<string, string> = {
		"c++": "cpp",
		cxx: "cpp",
		js: "javascript",
		jsx: "javascript",
		md: "markdown",
		sh: "bash",
		shell: "bash",
		ts: "typescript",
		tsx: "typescript",
	};
	return aliases[normalized] ?? normalized;
}

const autoHighlightLanguages = [
	"bash",
	"cpp",
	"css",
	"diff",
	"go",
	"java",
	"javascript",
	"json",
	"markdown",
	"python",
	"rust",
	"typescript",
	"xml",
	"yaml",
];

function highlightCode(text: string, lang: string): string
{
	const language = normalizeHighlightLanguage(lang);
	try
	{
		if (language && hljs.getLanguage(language))
		{
			return hljs.highlight(text, { language, ignoreIllegals: true }).value;
		}
		if (!language && text.trim())
		{
			const result = hljs.highlightAuto(text, autoHighlightLanguages);
			if (result.relevance >= 2)
			{
				return result.value;
			}
		}
	}
	catch
	{
		// Fall back to escaped plaintext; malformed input should not break chat rendering.
	}
	return escapeHtml(text);
}

function codeClassAttribute(lang: string, highlighted: string): string
{
	const classes = [highlighted.includes("hljs-") ? "hljs" : "", lang ? `language-${lang}` : ""].filter(Boolean);
	return classes.length > 0 ? ` class="${escapeHtml(classes.join(" "))}"` : "";
}

/** The shared markdown-it instance (exported for advanced callers). */
export const md = new MarkdownIt({
	html: true, // Enable HTML recognition so html_block/html_inline overrides can escape it
	breaks: true,
	linkify: true,
});

// GFM strikethrough (~~text~~) → <s> (allowlisted).
md.enable("strikethrough");

// Disable fuzzy link detection so bare filenames like "README.md" are not auto-linked.
md.linkify.set({ fuzzyLink: false });

// Re-enable www.-prefixed bare URL detection per GFM (avoids filename false positives).
md.linkify.add("www", {
	validate(text, pos)
	{
		const tail = text.slice(pos);
		const match = tail.match(
			/^\.(?:[a-zA-Z0-9-]+\.?)+[^\s<\u2E80-\u2FFF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF01-\uFF60]*/,
		);
		if (!match)
		{
			return 0;
		}
		let len = match[0].length;

		const balancePairs: Record<string, string> = {
			")": "(",
			"]": "[",
			"}": "{",
			'"': '"',
			"'": "'",
		};

		const balance: Record<string, number> = {};
		for (const [close, open] of Object.entries(balancePairs))
		{
			balance[close] = 0;
			for (let i = 0; i < len; i++)
			{
				const c = tail[i];
				if (open === close)
				{
					if (c === open)
					{
						balance[close] = balance[close] === 0 ? 1 : 0;
					}
				}
				else if (c === open)
				{
					balance[close]++;
				}
				else if (c === close)
				{
					balance[close]--;
				}
			}
		}

		while (len > 0)
		{
			const ch = tail[len - 1];
			if (/[?!.,:*_~]/.test(ch))
			{
				len--;
				continue;
			}
			if (ch === ";")
			{
				let j = len - 2;
				while (j >= 0 && /[a-zA-Z0-9]/.test(tail[j]))
				{
					j--;
				}
				if (j >= 0 && tail[j] === "&" && j < len - 2)
				{
					len = j;
					continue;
				}
				break;
			}
			const open = balancePairs[ch];
			if (open !== undefined)
			{
				if (open === ch)
				{
					if (balance[ch] !== 0)
					{
						balance[ch] = 0;
						len--;
						continue;
					}
				}
				else if (balance[ch] < 0)
				{
					balance[ch]++;
					len--;
					continue;
				}
			}
			break;
		}
		return len;
	},
	normalize(match)
	{
		match.url = "http://" + match.url;
	},
});

// Let all URLs through to renderers; DOMPurify strips dangerous schemes (matches marked.js).
md.validateLink = () => true;

// Trim trailing CJK swallowed into auto-linked URLs (RFC 3986).
md.core.ruler.after("linkify", "linkify-cjk-trim", (state) =>
{
	for (const blockToken of state.tokens)
	{
		if (blockToken.type !== "inline" || !blockToken.children)
		{
			continue;
		}
		const children = blockToken.children;
		for (let i = children.length - 1; i >= 0; i--)
		{
			const token = children[i];
			if (token.type !== "link_open")
			{
				continue;
			}
			if (token.markup !== "linkify")
			{
				continue;
			}
			const textToken = children[i + 1];
			if (!textToken || textToken.type !== "text")
			{
				continue;
			}
			const displayText = textToken.content;
			let cjkIdx = displayText.length;
			while (cjkIdx > 0 && CJK_RE.test(displayText[cjkIdx - 1]))
			{
				cjkIdx--;
			}
			if (cjkIdx <= 0 || cjkIdx === displayText.length)
			{
				continue;
			}
			const trimmedDisplay = displayText.slice(0, cjkIdx);
			const cjkTail = displayText.slice(cjkIdx);
			const href = token.attrGet("href") ?? "";
			const prefixLen = href.indexOf(displayText);
			const hrefPrefix = prefixLen > 0 ? href.slice(0, prefixLen) : "";
			token.attrSet("href", hrefPrefix + trimmedDisplay);
			textToken.content = trimmedDisplay;
			for (let j = i + 1; j < children.length; j++)
			{
				if (children[j].type === "link_close")
				{
					const tailToken = new state.Token("text", "", 0);
					tailToken.content = cjkTail;
					children.splice(j + 1, 0, tailToken);
					break;
				}
			}
		}
	}
});

// GFM task-list checkboxes (- [x] / - [ ]), read-only, no wrapping <label>.
md.use(markdownItTaskLists, { enabled: false, label: false });

// Trust ONLY the plugin's checkbox <input> token so the html_inline override lets it through.
md.core.ruler.after("github-task-lists", "task-list-allowlist", (state) =>
{
	const tokens = state.tokens;
	for (let i = 2; i < tokens.length; i++)
	{
		if (tokens[i].type !== "inline" || !tokens[i].children)
		{
			continue;
		}
		if (tokens[i - 1].type !== "paragraph_open")
		{
			continue;
		}
		if (tokens[i - 2].type !== "list_item_open")
		{
			continue;
		}
		const listItem = tokens[i - 2];
		const cls = listItem.attrGet("class") ?? "";
		if (!cls.includes("task-list-item"))
		{
			continue;
		}
		for (const child of tokens[i].children!)
		{
			if (child.type === "html_inline" && /^<input\s/i.test(child.content))
			{
				child.meta = { taskListPlugin: true };
				break;
			}
		}
	}
});

// A raw-HTML chunk is safe to pass through only if every non-blank line is a bare, allowlisted
// <details>/<summary> tag (the accordion expansion below emits exactly these). Everything else is
// escaped; DOMPurify remains the final gate regardless.
const _SAFE_DETAILS_LINE = /^(?:<details>|<\/details>|<summary>|<\/summary>|<summary>[^<>]*<\/summary>)$/;
function _isSafeDetailsHtml(content: string): boolean
{
	const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
	return lines.length > 0 && lines.every((l) => _SAFE_DETAILS_LINE.test(l));
}

// Escape raw HTML — only the trusted task-list checkbox <input> and the allowlisted
// <details>/<summary> tags (from accordion expansion) pass through.
md.renderer.rules.html_block = (tokens, idx) =>
{
	const content = tokens[idx].content;
	if (_isSafeDetailsHtml(content))
	{
		return content;
	}
	return escapeHtml(content) + "\n";
};
md.renderer.rules.html_inline = (tokens, idx) =>
{
	const token = tokens[idx];
	if (token.meta?.taskListPlugin === true)
	{
		return token.content;
	}
	if (_isSafeDetailsHtml(token.content))
	{
		return token.content;
	}
	return escapeHtml(token.content);
};

/**
 * Expand agent MDX-style components into markdown the pipeline can render. OpenClaw agents emit
 * `<AccordionGroup>`/`<Accordion title="…">…</Accordion>` (OpenClaw's control-ui renders these as
 * collapsibles; markdown-it would otherwise escape them as raw tags). We map them to allowlisted
 * `<details>`/`<summary>` with blank lines around the body so the inner markdown still parses, and
 * the summary title is HTML-escaped. Unknown attributes are dropped.
 */
function _expandAgentComponents(markdownLocal: string): string
{
	return markdownLocal
		.replace(/<\/?AccordionGroup[^>]*>/gi, "\n")
		.replace(
			/<Accordion\b[^>]*\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi,
			(_m, dq: string | undefined, sq: string | undefined) => `\n\n<details>\n<summary>${escapeHtml((dq ?? sq ?? "").trim())}</summary>\n\n`,
		)
		.replace(/<Accordion\b[^>]*>/gi, "\n\n<details>\n<summary>Details</summary>\n\n")
		.replace(/<\/Accordion>/gi, "\n\n</details>\n\n");
}

// Images: allow only base64 data URIs; otherwise show escaped alt text.
md.renderer.rules.image = (tokens, idx) =>
{
	const token = tokens[idx];
	const src = token.attrGet("src")?.trim() ?? "";
	const alt = normalizeMarkdownImageLabel(token.content);
	if (!INLINE_DATA_IMAGE_RE.test(src))
	{
		return escapeHtml(alt);
	}
	return `<img class="markdown-inline-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
};

function renderCodeCopyButton(): string
{
	return `<button type="button" class="code-block-copy" data-code="__CODE__" aria-label="${escapeHtml(COPY_CODE_ARIA)}"><span class="code-block-copy__idle">${escapeHtml(COPY_IDLE)}</span><span class="code-block-copy__done">${escapeHtml(COPY_DONE)}</span></button>`;
}

// Fenced code blocks: highlight + copy button, JSON collapses into <details>.
md.renderer.rules.fence = (tokens, idx, _options, env) =>
{
	const token = tokens[idx];
	const lang = token.info.trim().split(/\s+/)[0] || "";
	const text = token.content;
	const highlighted = highlightCode(text, lang);
	const classAttr = codeClassAttribute(lang, highlighted);
	const codeBlock = `<pre><code${classAttr}>${highlighted}</code></pre>`;
	if (!shouldRenderCodeBlockCopy(env))
	{
		return codeBlock;
	}
	const langLabel = lang ? `<span class="code-block-lang">${escapeHtml(lang)}</span>` : "";
	const copyBtn = renderCodeCopyButton().replace("__CODE__", escapeHtml(text));
	const header = `<div class="code-block-header">${langLabel}${copyBtn}</div>`;

	const trimmed = text.trim();
	const isJson =
		lang === "json" ||
		(!lang && ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))));

	if (isJson)
	{
		const lineCount = text.split("\n").length;
		const label = lineCount > 1 ? `JSON &middot; ${lineCount} lines` : "JSON";
		return `<details class="json-collapse"><summary>${label}</summary><div class="code-block-wrapper">${header}${codeBlock}</div></details>`;
	}

	return `<div class="code-block-wrapper">${header}${codeBlock}</div>`;
};

// Indented code blocks get the same chrome as fences.
md.renderer.rules.code_block = (tokens, idx, _options, env) =>
{
	const token = tokens[idx];
	const text = token.content;
	const highlighted = highlightCode(text, "");
	const classAttr = codeClassAttribute("", highlighted);
	const codeBlock = `<pre><code${classAttr}>${highlighted}</code></pre>`;
	if (!shouldRenderCodeBlockCopy(env))
	{
		return codeBlock;
	}
	const copyBtn = renderCodeCopyButton().replace("__CODE__", escapeHtml(text));
	const header = `<div class="code-block-header">${copyBtn}</div>`;

	const trimmed = text.trim();
	const isJson =
		(trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));

	if (isJson)
	{
		const lineCount = text.split("\n").length;
		const label = lineCount > 1 ? `JSON &middot; ${lineCount} lines` : "JSON";
		return `<details class="json-collapse"><summary>${label}</summary><div class="code-block-wrapper">${header}${codeBlock}</div></details>`;
	}

	return `<div class="code-block-wrapper">${header}${codeBlock}</div>`;
};

/** Render markdown to sanitized HTML (LRU-cached). The primary entry point. */
export function toSanitizedMarkdownHtml(markdownLocal: string, options: MarkdownRenderOptions = {}): string
{
	const renderOptions = normalizeMarkdownRenderOptions(options);
	const input = _expandAgentComponents(stripUnsupportedCitationControlMarkers(markdownLocal)).trim();
	if (!input)
	{
		return "";
	}
	installHooks();
	const cacheKey = `${renderOptions.codeBlockChrome}\0${input}`;
	if (input.length <= MARKDOWN_CACHE_MAX_CHARS)
	{
		const cached = getCachedMarkdown(cacheKey);
		if (cached !== null)
		{
			return cached;
		}
	}
	const truncated = truncateText(input, MARKDOWN_CHAR_LIMIT);
	const suffix = truncated.truncated
		? `\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`
		: "";
	if (truncated.text.length > MARKDOWN_PARSE_LIMIT)
	{
		// Very large replies stay readable as escaped plain text (skip the parse guard).
		const html = toEscapedPlainTextHtml(`${truncated.text}${suffix}`);
		const sanitized = DOMPurify.sanitize(html, sanitizeOptions);
		if (input.length <= MARKDOWN_CACHE_MAX_CHARS)
		{
			setCachedMarkdown(cacheKey, sanitized);
		}
		return sanitized;
	}
	let rendered: string;
	try
	{
		rendered = md.render(`${truncated.text}${suffix}`, renderOptions);
	}
	catch (err)
	{
		// Fall back to escaped plain text when md.render() throws.
		console.warn("[markdown] md.render failed, falling back to plain text:", err);
		const escaped = escapeHtml(`${truncated.text}${suffix}`);
		rendered = `<pre class="code-block">${escaped}</pre>`;
	}
	const sanitized = DOMPurify.sanitize(rendered, sanitizeOptions);
	if (input.length <= MARKDOWN_CACHE_MAX_CHARS)
	{
		setCachedMarkdown(cacheKey, sanitized);
	}
	return sanitized;
}

/** Wrap escaped plain text in the plain-text fallback container. */
export function toEscapedPlainTextHtml(value: string): string
{
	return `<div class="markdown-plain-text-fallback">${escapeHtml(value.replace(/\r\n?/g, "\n"))}</div>`;
}

/** Streaming variant that renders the entire buffer as escaped plain text. */
export function toStreamingPlainTextHtml(markdownLocal: string): string
{
	const input = normalizeMarkdownInput(markdownLocal);
	if (!input)
	{
		return "";
	}
	return toEscapedPlainTextHtml(input);
}

/**
 * Streaming variant: renders the stable prefix (up to the last safe boundary that is not inside
 * an open code fence) as markdown, and the still-streaming tail as escaped plain text.
 */
export function toStreamingMarkdownHtml(markdownLocal: string, options: MarkdownRenderOptions = {}): string
{
	const input = normalizeMarkdownInput(markdownLocal);
	if (!input)
	{
		return "";
	}

	const boundary = findStableStreamingMarkdownBoundary(input);
	if (boundary <= 0)
	{
		return toEscapedPlainTextHtml(input);
	}

	const stableMarkdown = input.slice(0, boundary);
	const streamingTail = input.slice(boundary);
	const stableHtml = toSanitizedMarkdownHtml(stableMarkdown, options);
	if (!streamingTail.trim())
	{
		return stableHtml;
	}
	return `${stableHtml}${toEscapedPlainTextHtml(streamingTail)}`;
}
