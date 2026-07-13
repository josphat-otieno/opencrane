import { MessageCard, ThreadMessage } from "@opencrane/core";

/**
 * A row in the rendered conversation stream: either a whole message, or a run of
 * consecutive tool-only assistant messages coalesced into one grouped tool disclosure.
 * OpenClaw emits each agentic step (tool call → result) as its own message, so a burst of
 * tool activity is many messages; folding them into one block makes it read as a single
 * "Called N tools". See {@link _BuildStreamBlocks}.
 */
export interface StreamBlock
{
	/** "tools" for a coalesced tool run; "message" for anything else. */
	kind: "tools" | "message";
	/** Stable track key. */
	id: string;
	/** The message, when kind is "message". */
	message?: ThreadMessage;
	/** The coalesced tool cards, when kind is "tools". */
	tools?: MessageCard[];
	/** Timestamp of the last message in a tool run (shown on hover). */
	time?: string;
}
