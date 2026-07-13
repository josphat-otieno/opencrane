import { describe, expect, it } from "vitest";

import { formatCollapsedToolPreviewText, isToolErrorOutput } from "../tool-output";

describe("isToolErrorOutput", () =>
{
	it("is false for empty / plain / non-object output", () =>
	{
		expect(isToolErrorOutput(undefined)).toBe(false);
		expect(isToolErrorOutput("   ")).toBe(false);
		expect(isToolErrorOutput("all good")).toBe(false);
		expect(isToolErrorOutput("[1,2,3]")).toBe(false);
	});

	it("detects the bare 'tool not found' sentinel", () =>
	{
		expect(isToolErrorOutput("Tool not found.")).toBe(true);
	});

	it("honours an explicit isError / is_error flag", () =>
	{
		expect(isToolErrorOutput(JSON.stringify({ isError: true }))).toBe(true);
		expect(isToolErrorOutput(JSON.stringify({ is_error: false, error: "x" }))).toBe(false);
	});

	it("treats a non-empty error field or error status as an error", () =>
	{
		expect(isToolErrorOutput(JSON.stringify({ error: "boom" }))).toBe(true);
		expect(isToolErrorOutput(JSON.stringify({ error: "" }))).toBe(false);
		expect(isToolErrorOutput(JSON.stringify({ status: "failed" }))).toBe(true);
		expect(isToolErrorOutput(JSON.stringify({ status: "ok" }))).toBe(false);
	});
});

describe("formatCollapsedToolPreviewText", () =>
{
	it("collapses whitespace and drops a leading 'with '", () =>
	{
		expect(formatCollapsedToolPreviewText("  with   the   file  ")).toBe("the file");
		expect(formatCollapsedToolPreviewText("")).toBeUndefined();
	});

	it("caps the preview length to 120 chars", () =>
	{
		expect(formatCollapsedToolPreviewText("x".repeat(200))?.length).toBe(120);
	});
});
