import { Pipe, PipeTransform, inject } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";

import { toSanitizedMarkdownHtml } from "@opencrane/state/conversation/render";

/**
 * Renders assistant markdown to safe HTML via the vendored OpenClaw pipeline
 * (markdown-it + highlight.js + DOMPurify allowlist). The output is already
 * DOMPurify-sanitized against the render lib's explicit allowlist, so it is marked
 * trusted to bypass Angular's second (stricter, chrome-stripping) sanitizer — which
 * would otherwise drop the code-copy button, task-list checkboxes, and JSON <details>.
 *
 * Pure pipe: memoised per input string by Angular, matching the pipeline's own LRU cache.
 */
@Pipe({ name: "woMarkdown", standalone: true })
export class MarkdownPipe implements PipeTransform
{
	private readonly _sanitizer = inject(DomSanitizer);

	/** Render markdown → trusted, pre-sanitized HTML. Empty/blank input yields "". */
	public transform(value: string | null | undefined): SafeHtml
	{
		const html = toSanitizedMarkdownHtml(value ?? "");
		return this._sanitizer.bypassSecurityTrustHtml(html);
	}
}
