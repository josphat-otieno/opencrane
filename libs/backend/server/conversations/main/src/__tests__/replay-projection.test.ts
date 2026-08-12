import { describe, expect, it } from "vitest";

import { __ProjectConversationReplayEvent } from "../replay-projection.js";

describe("conversation timeline projection", function _Suite()
{
	it("copies only display-safe message fields", function _Redacts()
	{
		const projected = __ProjectConversationReplayEvent({ cursor: "c.cursor", conversationId: "conversation-1", runId: "run-1", position: "1", type: "message.delta", payload: { messageId: "message-1", delta: "hello", capabilityProof: "secret", fence: 3 }, occurredAt: "2026-07-23T10:00:00.000Z" });
		expect(projected?.payload).toEqual({ messageId: "message-1", delta: "hello" });
	});

	it("drops unsupported payloads and invalid canonical rows", function _FailsClosed()
	{
		expect(__ProjectConversationReplayEvent({ cursor: "c.cursor", conversationId: "conversation-1", runId: "run-1", position: "1", type: "run.usage", payload: { providerKey: "secret" }, occurredAt: "2026-07-23T10:00:00.000Z" })?.payload).toEqual({});
		expect(__ProjectConversationReplayEvent({ cursor: "", conversationId: "conversation-1", runId: "run-1", position: "1", type: "run.started", payload: {}, occurredAt: "2026-07-23T10:00:00.000Z" })).toBeNull();
	});

	it("copies only display-safe source references", function _Sources()
	{
		const projected = __ProjectConversationReplayEvent({ cursor: "c.cursor", conversationId: "conversation-1", runId: "run-1", position: "1", type: "source.references", payload: { messageId: "message-1", citations: [{ id: "cite-1", label: "Project brief", snippet: "safe", storageUrl: "https://storage.invalid" }], artifacts: [{ id: "artifact-ref-1", label: "brief.pdf", accessState: "metadata_only", mediaType: "application/pdf", lease: "secret" }], memoryReferences: [{ id: "memory-1", factId: "fact-1", contentDigest: "sha256:abc", rawFact: "never" }] }, occurredAt: "2026-07-23T10:00:00.000Z" });
		expect(projected?.payload).toEqual({ sourceReferences: { messageId: "message-1", citations: [{ id: "cite-1", label: "Project brief", snippet: "safe" }], artifacts: [{ id: "artifact-ref-1", label: "brief.pdf", accessState: "metadata_only", mediaType: "application/pdf" }], memoryReferences: [{ id: "memory-1", factId: "fact-1", contentDigest: "sha256:abc" }] } });
	});
});
