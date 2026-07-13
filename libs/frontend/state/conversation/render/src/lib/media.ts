/*
 * Media attachment classification — the self-contained pure helpers extracted from OpenClaw's
 * `@openclaw/media-core` (`constants.ts`) and `message-normalizer.ts`. Maps a URL/mime to a
 * media family (image/audio/video/document) with a display label, so our extractor can surface
 * audio/video/document attachments — not just images. The deep `splitMediaFromOutput` /
 * inline-directive tail is NOT vendored; these operate on already-structured attachment refs.
 *
 * Derived from openclaw@v2026.6.11. MIT — Copyright (c) 2026 OpenClaw Foundation.
 * See THIRD_PARTY_NOTICES.md.
 */

/** Media families that share size-policy and MIME-classification behavior. */
export type MediaKind = "image" | "audio" | "video" | "document";

/** Maps a MIME type to the media family used for size limits and routing. */
export function mediaKindFromMime(mime?: string | null): MediaKind | undefined
{
	if (!mime)
	{
		return undefined;
	}
	if (mime.startsWith("image/"))
	{
		return "image";
	}
	if (mime.startsWith("audio/"))
	{
		return "audio";
	}
	if (mime.startsWith("video/"))
	{
		return "video";
	}
	if (mime === "application/pdf")
	{
		return "document";
	}
	if (mime.startsWith("text/"))
	{
		return "document";
	}
	if (mime.startsWith("application/"))
	{
		return "document";
	}
	return undefined;
}

const MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	heic: "image/heic",
	heif: "image/heif",
	ogg: "audio/ogg",
	oga: "audio/ogg",
	mp3: "audio/mpeg",
	wav: "audio/wav",
	flac: "audio/flac",
	aac: "audio/aac",
	opus: "audio/opus",
	m4a: "audio/mp4",
	mp4: "video/mp4",
	mov: "video/quicktime",
	pdf: "application/pdf",
	txt: "text/plain",
	md: "text/markdown",
	csv: "text/csv",
	json: "application/json",
	zip: "application/zip",
};

function getFileExtension(url: string): string | undefined
{
	const trimmed = url.trim();
	if (!trimmed)
	{
		return undefined;
	}
	const source = (() =>
	{
		try
		{
			if (/^https?:\/\//i.test(trimmed))
			{
				return new URL(trimmed).pathname;
			}
		}
		catch { /* fall through to the raw string */ }
		return trimmed;
	})();
	const fileName = source.split(/[\\/]/).pop() ?? source;
	const match = /\.([a-zA-Z0-9]+)$/.exec(fileName);
	return match?.[1]?.toLowerCase();
}

/** Best-effort MIME from a URL's file extension. */
export function mimeTypeFromUrl(url: string): string | undefined
{
	const ext = getFileExtension(url);
	return ext ? MIME_BY_EXT[ext] : undefined;
}

/** Classifies an attachment URL into a media kind, mime, and human label. */
export function inferAttachmentKind(url: string): { kind: MediaKind; mimeType?: string; label: string }
{
	const mimeType = mimeTypeFromUrl(url);
	const kind = mediaKindFromMime(mimeType) ?? "document";
	const label = (() =>
	{
		try
		{
			if (/^https?:\/\//i.test(url))
			{
				const parsed = new URL(url);
				const name = parsed.pathname.split("/").pop()?.trim();
				return name || parsed.hostname || url;
			}
		}
		catch { /* fall through to the raw string */ }
		const name = url.split(/[\\/]/).pop()?.trim();
		return name || url;
	})();
	return mimeType ? { kind, mimeType, label } : { kind, label };
}
