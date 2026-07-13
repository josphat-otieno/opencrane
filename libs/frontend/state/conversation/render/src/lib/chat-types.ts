/*
 * Chat render-model types — vendored from OpenClaw (`ui/src/ui/types/chat-types.ts`).
 *
 * These are the view-model types WeOwnAI's conversation renderer consumes. The upstream
 * `ChatItem`/`MessageGroup` Slack-style layout types are intentionally NOT vendored (we do
 * not group messages that way); only the per-message content model is kept.
 *
 * Derived from openclaw@v2026.6.11. MIT — Copyright (c) 2026 OpenClaw Foundation.
 * See THIRD_PARTY_NOTICES.md.
 */

/** A canvas (A2UI) preview descriptor carried by a tool card or a message content item. */
export type CanvasPreview = {
	kind: "canvas";
	surface: "assistant_message";
	render: "url";
	title?: string;
	preferredHeight?: number;
	url?: string;
	viewId?: string;
	className?: string;
	style?: string;
};

/** Content item types in a normalized message. */
export type MessageContentItem =
	| {
			type: "text" | "tool_call" | "tool_result";
			text?: string;
			name?: string;
			args?: unknown;
			/** Tool output text (tool_result items). */
			output?: string;
			/** Whether a tool_result item is an error. */
			isError?: boolean;
	  }
	| {
			type: "attachment";
			attachment: {
				url: string;
				kind: "image" | "audio" | "video" | "document";
				label: string;
				mimeType?: string;
				isVoiceNote?: boolean;
			};
	  }
	| {
			type: "canvas";
			preview: CanvasPreview;
			rawText?: string | null;
	  };

/** Normalized message structure for rendering. */
export type NormalizedMessage = {
	role: string;
	content: MessageContentItem[];
	timestamp: number;
	id?: string;
	senderLabel?: string | null;
};
