import { describe, expect, it } from "vitest";

import { extractFileArtifact } from "../file-artifact";

describe("extractFileArtifact", () =>
{
	it("reads a `read` tool: path from args, content from output, language from extension", () =>
	{
		const art = extractFileArtifact("read", JSON.stringify({ path: "/app/src/foo.ts", limit: 120 }), "export const x = 1;");
		expect(art).toEqual({ path: "/app/src/foo.ts", name: "foo.ts", content: "export const x = 1;", language: "typescript" });
	});

	it("reads a write/edit tool: content is the written text, not the output", () =>
	{
		const art = extractFileArtifact("write", JSON.stringify({ file_path: "docs/readme.md", content: "# Title" }), "ok");
		expect(art).toEqual({ path: "docs/readme.md", name: "readme.md", content: "# Title", language: "markdown" });
	});

	it("uses new_str for an edit tool", () =>
	{
		const art = extractFileArtifact("edit", JSON.stringify({ path: "a/b.py", old_str: "x", new_str: "y = 2" }), "");
		expect(art?.content).toBe("y = 2");
		expect(art?.language).toBe("python");
	});

	it("returns null for a non-file tool (exec with a command, no path)", () =>
	{
		expect(extractFileArtifact("exec", JSON.stringify({ command: "ls -la" }), "a\nb")).toBeNull();
	});

	it("returns null for a tool that has a path but is neither read nor write (e.g. grep)", () =>
	{
		expect(extractFileArtifact("grep", JSON.stringify({ path: "/src", pattern: "foo" }), "match")).toBeNull();
	});

	it("returns null when arguments are not a JSON object", () =>
	{
		expect(extractFileArtifact("read", "not json", "x")).toBeNull();
		expect(extractFileArtifact("read", undefined, "x")).toBeNull();
	});

	it("falls back to plain language for an unknown extension", () =>
	{
		const art = extractFileArtifact("read", JSON.stringify({ path: "/etc/hosts" }), "127.0.0.1");
		expect(art?.language).toBe("");
		expect(art?.name).toBe("hosts");
	});
});
