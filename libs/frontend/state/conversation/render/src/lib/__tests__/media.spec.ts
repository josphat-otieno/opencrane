import { describe, expect, it } from "vitest";

import { inferAttachmentKind, mediaKindFromMime, mimeTypeFromUrl } from "../media";

describe("mediaKindFromMime", () =>
{
	it("maps mime prefixes to media families", () =>
	{
		expect(mediaKindFromMime("image/png")).toBe("image");
		expect(mediaKindFromMime("audio/mpeg")).toBe("audio");
		expect(mediaKindFromMime("video/mp4")).toBe("video");
		expect(mediaKindFromMime("application/pdf")).toBe("document");
		expect(mediaKindFromMime("text/csv")).toBe("document");
		expect(mediaKindFromMime(undefined)).toBeUndefined();
	});
});

describe("mimeTypeFromUrl", () =>
{
	it("infers mime from the file extension (path or query URL)", () =>
	{
		expect(mimeTypeFromUrl("/media/clip.mp3")).toBe("audio/mpeg");
		expect(mimeTypeFromUrl("https://x/y/report.pdf?dl=1")).toBe("application/pdf");
		expect(mimeTypeFromUrl("/no/extension")).toBeUndefined();
	});
});

describe("inferAttachmentKind", () =>
{
	it("classifies an audio URL with a filename label", () =>
	{
		expect(inferAttachmentKind("/media/note.m4a")).toEqual({ kind: "audio", mimeType: "audio/mp4", label: "note.m4a" });
	});

	it("falls back to document + hostname/url label for unknown types", () =>
	{
		expect(inferAttachmentKind("https://host/thing")).toEqual({ kind: "document", label: "thing" });
	});
});
