// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { toSanitizedMarkdownHtml, toStreamingMarkdownHtml } from "../markdown";

describe("toSanitizedMarkdownHtml — rendering", () =>
{
	it("renders basic markdown (bold, links) with hardened anchor attrs", () =>
	{
		const html = toSanitizedMarkdownHtml("**hi** [x](https://example.com)");
		expect(html).toContain("<strong>hi</strong>");
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('rel="noreferrer noopener"');
		expect(html).toContain('target="_blank"');
	});

	it("renders a fenced code block with a copy button carrying the raw code", () =>
	{
		const html = toSanitizedMarkdownHtml("```ts\nconst a = 1;\n```");
		expect(html).toContain("code-block-copy");
		expect(html).toContain("data-code");
		expect(html).toContain("language-ts");
	});

	it("collapses a JSON code block into a <details> summary", () =>
	{
		const html = toSanitizedMarkdownHtml('```json\n{\n  "a": 1\n}\n```');
		expect(html).toContain("<details");
		expect(html).toContain("<summary>JSON");
	});

	it("renders a GFM table (pipe rows + --- separator) as a <table>", () =>
	{
		const html = toSanitizedMarkdownHtml("| Item | Value |\n| --- | --- |\n| OS | linux |");
		expect(html).toContain("<table>");
		expect(html).toContain("<th>Item</th>");
		expect(html).toContain("<td>OS</td>");
	});

	it("leaves a NON-GFM table (no --- separator row) as plain text (upstream format issue)", () =>
	{
		// The OpenClaw status output uses a box-drawing separator, not `|---|`, so markdown-it
		// (correctly) does not treat it as a table — this documents that gap is agent-side.
		const html = toSanitizedMarkdownHtml("| Item | Value |\n| OS | linux |");
		expect(html).not.toContain("<table>");
	});

	it("renders GFM task lists as read-only checkboxes", () =>
	{
		const html = toSanitizedMarkdownHtml("- [x] done\n- [ ] todo");
		expect(html).toContain("<input");
		expect(html).toContain("disabled");
		expect(html).toContain("checked");
	});
});

describe("toSanitizedMarkdownHtml — agent MDX components", () =>
{
	it("expands <Accordion title> into a <details>/<summary> with inner markdown rendered", () =>
	{
		const html = toSanitizedMarkdownHtml('<AccordionGroup>\n<Accordion title="conversations_list">\nLists **recent** conversations.\n</Accordion>\n</AccordionGroup>');
		expect(html).toContain("<details>");
		expect(html).toContain("<summary>conversations_list</summary>");
		expect(html).toContain("<strong>recent</strong>"); // inner markdown still parsed
		expect(html).not.toContain("&lt;Accordion"); // no raw escaped tag
	});

	it("escapes a non-allowlisted raw tag even after the details relaxation", () =>
	{
		const html = toSanitizedMarkdownHtml("<section onclick=alert(1)>x</section>");
		expect(html).not.toContain("<section");
		expect(html).toContain("&lt;section");
	});
});

describe("toSanitizedMarkdownHtml — sanitization posture", () =>
{
	it("strips a javascript: link href (dangerous scheme)", () =>
	{
		const html = toSanitizedMarkdownHtml("[click](javascript:alert(1))");
		expect(html).not.toContain("javascript:");
	});

	it("strips a host-local filesystem link href", () =>
	{
		const html = toSanitizedMarkdownHtml("[secret](/Users/alice/.ssh/id_rsa)");
		expect(html).not.toContain("/Users/alice");
	});

	it("escapes raw HTML (script/img) rather than rendering it as live elements", () =>
	{
		const html = toSanitizedMarkdownHtml("<script>alert(1)</script><img src=x onerror=alert(1)>");
		// The dangerous markup survives only as escaped, inert text — never live elements.
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("&lt;img");
	});

	it("drops a non-data-URI markdown image, keeping only its alt text", () =>
	{
		const html = toSanitizedMarkdownHtml("![alt](https://evil/x.png)");
		expect(html).not.toContain("<img");
		expect(html).toContain("alt");
	});

	it("keeps a base64 data-URI image", () =>
	{
		const html = toSanitizedMarkdownHtml("![pic](data:image/png;base64,iVBORw0KGgo=)");
		expect(html).toContain("<img");
		expect(html).toContain("data:image/png;base64");
	});
});

describe("toStreamingMarkdownHtml", () =>
{
	it("renders the stable prefix as markdown and the open-fence tail as plain text", () =>
	{
		const html = toStreamingMarkdownHtml("done\n\n```ts\nconst partial =");
		expect(html).toContain("<p>done</p>");
		expect(html).toContain("markdown-plain-text-fallback");
	});
});
