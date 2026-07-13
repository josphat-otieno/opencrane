import { describe, expect, it } from "vitest";

import { extractCanvasFromText, extractCanvasShortcodes } from "../canvas-render";

describe("extractCanvasFromText", () =>
{
	it("returns a url canvas preview from a view-shaped JSON payload", () =>
	{
		const preview = extractCanvasFromText(JSON.stringify({ kind: "canvas", view: { url: "/doc/1", id: "v1", title: "Report" } }));
		expect(preview).toEqual({ kind: "canvas", surface: "assistant_message", render: "url", url: "/doc/1", viewId: "v1", title: "Report" });
	});

	it("returns a url canvas preview from a source-shaped JSON payload", () =>
	{
		const preview = extractCanvasFromText(JSON.stringify({ kind: "canvas", source: { type: "url", url: "https://x/y" } }));
		expect(preview?.url).toBe("https://x/y");
	});

	it("ignores non-canvas / malformed payloads", () =>
	{
		expect(extractCanvasFromText(undefined)).toBeUndefined();
		expect(extractCanvasFromText("not json")).toBeUndefined();
		expect(extractCanvasFromText(JSON.stringify({ kind: "table" }))).toBeUndefined();
	});

	it("clamps preferredHeight to [160, 1200]", () =>
	{
		const low = extractCanvasFromText(JSON.stringify({ kind: "canvas", view: { url: "/d", title: "t" }, presentation: { preferred_height: 10 } }));
		expect(low?.preferredHeight).toBeUndefined();
		const high = extractCanvasFromText(JSON.stringify({ kind: "canvas", presentation: { preferred_height: 5000 }, view: { url: "/d" } }));
		expect(high?.preferredHeight).toBe(1200);
	});
});

describe("extractCanvasShortcodes", () =>
{
	it("extracts a self-closing [embed …/] and strips it from the text", () =>
	{
		const { text, previews } = extractCanvasShortcodes('before [embed ref="doc-9" title="Chart" /] after');
		expect(previews).toHaveLength(1);
		expect(previews[0].viewId).toBe("doc-9");
		expect(previews[0].url).toContain("doc-9");
		// The shortcode is removed in place; only blank-line runs are collapsed, so the
		// spaces that surrounded it remain and the result is trimmed at the ends.
		expect(text).toBe("before  after");
		expect(text).not.toContain("[embed");
	});

	it("leaves an [embed …] inside a code fence as literal text (no preview)", () =>
	{
		const src = "```\n[embed ref=\"x\" /]\n```";
		const { text, previews } = extractCanvasShortcodes(src);
		expect(previews).toHaveLength(0);
		expect(text).toBe(src);
	});

	it("is a no-op when there is no embed shortcode", () =>
	{
		expect(extractCanvasShortcodes("plain text")).toEqual({ text: "plain text", previews: [] });
	});
});
