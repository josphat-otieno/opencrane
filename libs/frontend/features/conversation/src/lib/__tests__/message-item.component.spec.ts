import { readFileSync } from "node:fs";

import { ConversationMessageRoles, ConversationMessageStates, ConversationMessageView } from "../conversation.types";

describe("conversation message presentation", () =>
{
	it("represents user, assistant, tool, citation, loading, and failure states", () =>
	{
		const message: ConversationMessageView = {
			id: "message-1",
			role: ConversationMessageRoles.Assistant,
			text: "A safe rendered answer",
			state: ConversationMessageStates.Failed,
			citations: [{ id: "source-1", label: "Project brief" }],
			tools: [{ id: "tool-1", label: "Reviewed project brief", complete: true }]
		};
		const template = readFileSync("src/lib/message-item/message-item.component.html", "utf8");

		expect(Object.values(ConversationMessageRoles)).toEqual(["user", "assistant"]);
		expect(Object.values(ConversationMessageStates)).toEqual(["complete", "loading", "failed"]);
		expect(message.citations?.[0]?.label).toBe("Project brief");
		expect(message.tools?.[0]?.complete).toBe(true);
		expect(template).toContain("role=\"status\"");
		expect(template).toContain("aria-label=\"Assistant is responding\"");
		expect(template).toContain("role=\"alert\"");
	});

	it("contains no retired transport or local command behavior", () =>
	{
		const template = readFileSync("src/lib/message-item/message-item.component.html", "utf8").toLowerCase();

		expect(template).not.toContain("openclaw");
		expect(template).not.toContain("websocket");
		expect(template).not.toContain("pod-token");
		expect(template).not.toContain("(click)");
	});

});
