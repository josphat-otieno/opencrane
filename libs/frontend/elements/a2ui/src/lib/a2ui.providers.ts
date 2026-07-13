import { EnvironmentProviders, Provider } from "@angular/core";
import { DEFAULT_CATALOG, provideA2UI, provideMarkdownRenderer } from "@a2ui/angular/v0_8";

import { toSanitizedMarkdownHtml } from "@opencrane/state/conversation/render";

import { _WoA2uiTheme } from "./a2ui.theme";

/**
 * App-level providers for in-process A2UI rendering (the v0.8 dialect OpenClaw ships at the
 * pinned tag). Registers the standard component catalog + an empty theme, and routes A2UI's
 * Text markdown through the SAME vendored pipeline the transcript uses — one renderer, one
 * sanitization posture. Include once in an app's `providers` (spread the returned array).
 */
export function provideWoA2ui(): (Provider | EnvironmentProviders)[]
{
	return [
		provideA2UI({ catalog: DEFAULT_CATALOG, theme: _WoA2uiTheme() }),
		// A2UI's MarkdownRenderer is `(markdown, options?) => Promise<string>`; hand it our
		// already-DOMPurify-sanitized output so agent-authored canvas text is safe + consistent.
		provideMarkdownRenderer(async (markdown: string) => toSanitizedMarkdownHtml(markdown)),
	];
}
