import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it, vi } from "vitest";

import { ControlPlaneApiService } from "@opencrane/core";

import { ConversationMessageStates } from "../conversation-display.types.js";
import { OpenCraneConversationReplayReader, __ReadConversationReplay, __ToConversationReplayView } from "../opencrane-conversation-replay-reader.js";

/** Construct one reader with controlled generated-client responses. */
function _Reader(body: string | readonly string[])
{
	const get = vi.fn();
	for (const page of Array.isArray(body) ? body : [body])
	{
		get.mockResolvedValueOnce({ data: page });
	}
	const injector = Injector.create({ providers: [{ provide: ControlPlaneApiService, useValue: { client: { GET: get } } }] });
	const reader = runInInjectionContext(injector, function _create(): OpenCraneConversationReplayReader
	{
		return new OpenCraneConversationReplayReader();
	});
	return { reader, get };
}

describe("OpenCraneConversationReplayReader", function _Suite()
{
	it("reads the participant-bound replay endpoint and resumes with the exact opaque cursor", async function _ReadsReplay()
	{
		const fixture = "id: cursor-1\nevent: ag-ui\ndata: {\"type\":\"RUN_STARTED\",\"threadId\":\"conversation-1\",\"runId\":\"run-1\"}\n\nid: cursor-2\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_START\",\"messageId\":\"message-1\",\"role\":\"assistant\"}\n\nid: cursor-3\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"messageId\":\"message-1\",\"delta\":\"hello\"}\n\n";
		const { reader, get } = _Reader(fixture);

		const state = await reader.replay("conversation-1", "prior-cursor");

		expect(get).toHaveBeenCalledWith("/me/conversations/{conversationId}/events", {
			params: { path: { conversationId: "conversation-1" }, query: { cursor: "prior-cursor" }, header: { "Last-Event-ID": "prior-cursor" } },
			parseAs: "text"
		});
		expect(state.cursor).toBe("cursor-3");
		expect(state.messages["message-1"]?.text).toBe("hello");
	});

	it("rejects malformed records rather than rendering inferred conversation content", function _RejectsMalformed()
	{
		expect(function _read(): void { __ReadConversationReplay("id: cursor-1\nevent: ag-ui\ndata: {bad}\n\n"); }).toThrow("invalid canonical conversation replay");
	});

	it("permits the authorised empty replay without disclosing an inferred conversation state", function _AllowsEmpty()
	{
		const state = __ReadConversationReplay("");

		expect(state.cursor).toBeNull();
		expect(state.messages).toEqual({});
	});

	it("maps display-safe assistant and tool replay state into route rows", function _MapsReplayRows()
	{
		const fixture = "id: cursor-1\nevent: ag-ui\ndata: {\"type\":\"RUN_STARTED\",\"threadId\":\"thread-1\",\"runId\":\"run-1\"}\n\nid: cursor-2\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_START\",\"messageId\":\"message-1\",\"role\":\"assistant\"}\n\nid: cursor-3\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"messageId\":\"message-1\",\"delta\":\"hello\"}\n\nid: cursor-4\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_END\",\"messageId\":\"message-1\"}\n\nid: cursor-5\nevent: ag-ui\ndata: {\"type\":\"TOOL_CALL_START\",\"toolCallId\":\"tool-1\",\"toolCallName\":\"Search\"}\n\nid: cursor-6\nevent: ag-ui\ndata: {\"type\":\"TOOL_CALL_END\",\"toolCallId\":\"tool-1\"}\n\n";
		const state = __ReadConversationReplay(fixture);

		const view = __ToConversationReplayView("thread-1", state);

		expect(view.runId).toBe("run-1");
		expect(view.messages[0]?.text).toBe("hello");
		expect(view.messages[0]?.state).toBe(ConversationMessageStates.Complete);
		expect(view.messages[0]?.tools?.[0]?.label).toBe("Search");
	});

	it("follows bounded replay cursors until the stream stops advancing", async function _ReadsReplayPages()
	{
		const first = "id: cursor-1\nevent: ag-ui\ndata: {\"type\":\"RUN_STARTED\",\"threadId\":\"thread-1\",\"runId\":\"run-1\"}\n\nid: cursor-2\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_START\",\"messageId\":\"message-1\",\"role\":\"assistant\"}\n\n";
		const second = "id: cursor-2\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_START\",\"messageId\":\"message-1\",\"role\":\"assistant\"}\n\nid: cursor-3\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"messageId\":\"message-1\",\"delta\":\"paged\"}\n\n";
		const third = "id: cursor-3\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"messageId\":\"message-1\",\"delta\":\"paged\"}\n\n";
		const { reader, get } = _Reader([first, second, third]);

		const view = await reader.read("thread-1");

		expect(get).toHaveBeenNthCalledWith(2, "/me/conversations/{threadId}/events", {
			params: { path: { threadId: "thread-1" }, query: { cursor: "cursor-2" }, header: { "Last-Event-ID": "cursor-2" } },
			parseAs: "text"
		});
		expect(view.cursor).toBe("cursor-3");
		expect(view.messages[0]?.text).toBe("paged");
	});

	it("marks incomplete assistant output failed when canonical replay reports run failure", function _MapsFailedReplay()
	{
		const fixture = "id: cursor-1\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_START\",\"messageId\":\"message-1\",\"role\":\"assistant\"}\n\nid: cursor-2\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"messageId\":\"message-1\",\"delta\":\"partial\"}\n\nid: cursor-3\nevent: ag-ui\ndata: {\"type\":\"CUSTOM\",\"name\":\"opencrane.run_failed\",\"value\":{\"eventType\":\"run.failed\"}}\n\n";
		const state = __ReadConversationReplay(fixture);

		const view = __ToConversationReplayView("thread-1", state);

		expect(view.messages[0]?.text).toBe("partial");
		expect(view.messages[0]?.state).toBe(ConversationMessageStates.Failed);
	});

	it("maps display-safe source references without exposing raw artifact or memory fields", function _MapsSourceReferences()
	{
		const fixture = "id: cursor-1\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_START\",\"messageId\":\"message-1\",\"role\":\"assistant\"}\n\nid: cursor-2\nevent: ag-ui\ndata: {\"type\":\"TEXT_MESSAGE_CONTENT\",\"messageId\":\"message-1\",\"delta\":\"grounded\"}\n\nid: cursor-3\nevent: ag-ui\ndata: {\"type\":\"OPENCRANE_SOURCE_REFERENCES\",\"messageId\":\"message-1\",\"citations\":[{\"id\":\"cite-1\",\"label\":\"Project brief\",\"snippet\":\"safe\"}],\"artifacts\":[],\"memoryReferences\":[]}\n\nid: cursor-4\nevent: ag-ui\ndata: {\"type\":\"OPENCRANE_SOURCE_REFERENCES\",\"citations\":[{\"id\":\"cite-2\",\"label\":\"Run source\",\"sourceKind\":\"document\"}],\"artifacts\":[{\"id\":\"artifact-ref-1\",\"label\":\"brief.pdf\",\"accessState\":\"metadata_only\",\"mediaType\":\"application/pdf\",\"leaseUrl\":\"never\"}],\"memoryReferences\":[{\"id\":\"memory-1\",\"factId\":\"fact-1\",\"contentDigest\":\"sha256:abc\",\"rawFact\":\"never\"}]}\n\n";
		const state = __ReadConversationReplay(fixture);

		const view = __ToConversationReplayView("thread-1", state);

		expect(view.messages[0]?.citations).toEqual([{ id: "cite-1", label: "Project brief", snippet: "safe" }]);
		expect(view.citations).toEqual([{ id: "cite-2", label: "Run source", sourceKind: "document" }]);
		expect(view.files).toEqual([{ id: "artifact-ref-1", name: "brief.pdf", type: "application/pdf", accessState: "metadata_only" }]);
		expect(view.memoryReferences).toEqual([{ id: "memory-1", label: "fact-1", contentDigest: "sha256:abc" }]);
	});
});
