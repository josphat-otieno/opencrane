import { describe, expect, it } from "vitest";

import { AG_UI_PROJECTION_VERSION, AgUiSourceAccessStates, __EncodeAgUiSseRecord, __ProjectAgUiEvent, type AgUiProjectionSourceEvent } from "../index.js";

/** Construct one server-authorized safe source event for projection tests. */
function _Source(eventType: AgUiProjectionSourceEvent["eventType"], payload: AgUiProjectionSourceEvent["payload"] = {}): AgUiProjectionSourceEvent
{
	return { cursor: "event-4", threadId: "thread-2", runId: "run-3", sequence: 4, eventType, occurredAt: "2026-07-23T00:00:00.000Z", payload };
}

describe("AG-UI projection", function _Suite()
{
	it("projects run lifecycle events with their authorized thread and run coordinates", function _ProjectsLifecycle()
	{
		expect(__ProjectAgUiEvent(_Source("run.accepted")).data).toEqual({ type: "RUN_STARTED", threadId: "thread-2", runId: "run-3" });
		expect(__ProjectAgUiEvent(_Source("run.started")).data).toEqual({ type: "RUN_STARTED", threadId: "thread-2", runId: "run-3" });
		expect(__ProjectAgUiEvent(_Source("run.completed")).data).toEqual({ type: "RUN_FINISHED", threadId: "thread-2", runId: "run-3" });
		expect(__ProjectAgUiEvent(_Source("run.cancelled")).data).toEqual({ type: "RUN_FINISHED", threadId: "thread-2", runId: "run-3" });
	});

	it("projects safe message and tool identifiers but never an untrusted tool result", function _ProjectsSafeFields()
	{
		expect(__ProjectAgUiEvent(_Source("message.started", { messageId: "message-1" })).data).toEqual({ type: "TEXT_MESSAGE_START", messageId: "message-1", role: "assistant" });
		expect(__ProjectAgUiEvent(_Source("message.delta", { messageId: "message-1", delta: "hello" })).data).toEqual({ type: "TEXT_MESSAGE_CONTENT", messageId: "message-1", delta: "hello" });
		expect(__ProjectAgUiEvent(_Source("message.completed", { messageId: "message-1" })).data).toEqual({ type: "TEXT_MESSAGE_END", messageId: "message-1" });
		expect(__ProjectAgUiEvent(_Source("tool.requested", { toolCallId: "tool-1", toolCallName: "search" })).data).toEqual({ type: "TOOL_CALL_START", toolCallId: "tool-1", toolCallName: "search" });
		expect(__ProjectAgUiEvent(_Source("tool.completed", { toolCallId: "tool-1", toolResult: "AWS_SECRET_ACCESS_KEY=never-forwarded" })).data).toEqual({ type: "TOOL_CALL_END", toolCallId: "tool-1" });
	});

	it("projects display-safe OpenCrane source references", function _ProjectsSources()
	{
		expect(__ProjectAgUiEvent(_Source("message.sources", { messageId: "message-1", citations: [{ id: "cite-1", label: "Project brief", snippet: "safe", storageUrl: "never" } as never], artifacts: [{ id: "artifact-ref-1", label: "brief.pdf", accessState: AgUiSourceAccessStates.MetadataOnly, mediaType: "application/pdf", lease: "never" } as never], memoryReferences: [{ id: "memory-1", factId: "fact-1", contentDigest: "sha256:abc", rawFact: "never" } as never] })).data).toEqual({ type: "OPENCRANE_SOURCE_REFERENCES", messageId: "message-1", citations: [{ id: "cite-1", label: "Project brief", snippet: "safe" }], artifacts: [{ id: "artifact-ref-1", label: "brief.pdf", accessState: "metadata_only", mediaType: "application/pdf" }], memoryReferences: [{ id: "memory-1", factId: "fact-1", contentDigest: "sha256:abc" }] });
		expect(__ProjectAgUiEvent(_Source("source.references")).data).toEqual({ type: "CUSTOM", name: "opencrane.source_references", value: { eventType: "source.references" } });
	});

	it("retains every unsupported or incomplete canonical event as a payload-free custom signal", function _ProjectsCustom()
	{
		const eventTypes: readonly AgUiProjectionSourceEvent["eventType"][] = ["tool.started", "tool.progress", "tool.approval_required", "context.compaction_started", "context.compaction_completed", "run.usage", "run.failed", "future.event"];
		for (const eventType of eventTypes)
		{
			expect(__ProjectAgUiEvent(_Source(eventType, { delta: "do-not-forward" })).data).toEqual({ type: "CUSTOM", name: `opencrane.${eventType.replaceAll(".", "_")}`, value: { eventType } });
		}
		expect(__ProjectAgUiEvent(_Source("message.delta")).data).toEqual({ type: "CUSTOM", name: "opencrane.message_delta", value: { eventType: "message.delta" } });
	});

	it("encodes a versioned projection as one bounded SSE record", function _EncodesSse()
	{
		const record = __ProjectAgUiEvent(_Source("run.started"));
		expect(AG_UI_PROJECTION_VERSION).toBe("opencrane.ag-ui.v1");
		expect(__EncodeAgUiSseRecord(record)).toBe("id: event-4\nevent: ag-ui\ndata: {\"type\":\"RUN_STARTED\",\"threadId\":\"thread-2\",\"runId\":\"run-3\"}\n\n");
	});

	it("refuses a cursor that could inject a second SSE field", function _RejectsInjectedCursor()
	{
		const record = __ProjectAgUiEvent({ ..._Source("run.started"), cursor: "event-4\nevent: forged" });
		expect(() => __EncodeAgUiSseRecord(record)).toThrow("invalid SSE cursor");
	});
});
