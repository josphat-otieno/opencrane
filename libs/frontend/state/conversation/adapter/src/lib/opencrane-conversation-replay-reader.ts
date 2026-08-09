import { Injectable, inject } from "@angular/core";

import { ControlPlaneApiService } from "@opencrane/core";
import { __CreateAgUiStreamState, __DecodeAgUiSseRecord, __ReduceAgUiStream, type AgUiStreamState, type AgUiToolView } from "@opencrane/state/conversation/ag-ui";

import { ConversationMessageRoles, ConversationMessageStates, type ConversationMessageView, type ConversationReplayView, type ConversationToolView } from "./conversation-display.types.js";
import type { ConversationReplayGateway } from "./conversation-gateway.types.js";
import type { ConversationReplayReader } from "./conversation-replay-reader.types.js";

/** Maximum bounded replay pages read for one route load before treating the source as unavailable. */
const _MAX_REPLAY_PAGES = 50;

/** Read one finite canonical AG-UI SSE response into display-safe browser state. */
export function __ReadConversationReplay(body: string, initialState: AgUiStreamState = __CreateAgUiStreamState()): AgUiStreamState
{
	let state = initialState;
	if (body.length === 0) return state;
	for (const frame of body.split(/\r?\n\r?\n/u))
	{
		if (frame.trim().length === 0) continue;
		const record = __DecodeAgUiSseRecord(frame);
		if (record === null) throw new Error("invalid canonical conversation replay");
		state = __ReduceAgUiStream(state, record);
	}
	return state;
}

/** Cookie-session reader for the owner-bound canonical conversation replay endpoint. */
@Injectable()
export class OpenCraneConversationReplayReader implements ConversationReplayGateway, ConversationReplayReader
{
	/** Generated Control Plane client carrying the browser's existing session cookie. */
	private readonly _api = inject(ControlPlaneApiService);

	/** @inheritdoc */
	public async read(threadId: string, cursor?: string): Promise<ConversationReplayView>
	{
		return __ToConversationReplayView(threadId, await this._readAll(threadId, cursor));
	}

	/** @inheritdoc */
	public async replay(threadId: string, cursor?: string): Promise<AgUiStreamState>
	{
		return __ReadConversationReplay(await this._readBody(threadId, cursor));
	}

	/** Follow bounded replay pages until the authoritative cursor stops advancing. */
	private async _readAll(threadId: string, cursor?: string): Promise<AgUiStreamState>
	{
		// 1. Start from an empty reducer state so repeated pages can be de-duplicated by cursor.
		let state = __CreateAgUiStreamState();
		let nextCursor = cursor;
		for (let page = 0; page < _MAX_REPLAY_PAGES; page += 1)
		{
			// 2. Read the next bounded page through the server-issued cursor.
			const previousCursor = state.cursor;
			state = __ReadConversationReplay(await this._readBody(threadId, nextCursor), state);
			// 3. Stop once the authoritative cursor no longer advances, avoiding an infinite replay loop.
			if (state.cursor === previousCursor) return state;
			nextCursor = state.cursor ?? undefined;
		}
		// 4. Fail closed when the replay source keeps advancing beyond the bounded client read.
		throw new Error("canonical conversation replay did not converge");
	}

	/** Read one bounded replay body without reducing it. */
	private async _readBody(threadId: string, cursor?: string): Promise<string>
	{
		if (threadId.trim().length === 0) throw new Error("conversation thread id is required");
		const { data, error } = await this._api.client.GET("/me/conversations/{threadId}/events", {
			params: {
				path: { threadId },
				...(cursor === undefined ? {} : { query: { cursor }, header: { "Last-Event-ID": cursor } })
			},
			parseAs: "text"
		});
		if (error || data === undefined) throw new Error("canonical conversation replay is unavailable");
		return data;
	}
}

/** Create an empty route replay state without inferring server-owned thread state. */
export function __CreateEmptyConversationReplayView(threadId: string | null): ConversationReplayView
{
	return { threadId, cursor: null, runId: null, messages: [], customEvents: [] };
}

/** Convert reduced AG-UI state into the display rows consumed by the conversation feature. */
export function __ToConversationReplayView(threadId: string, state: AgUiStreamState): ConversationReplayView
{
	const failed = _isFailedReplay(state);
	const messages = Object.values(state.messages).map(function _message(message): ConversationMessageView
	{
		return {
			id: message.id,
			role: ConversationMessageRoles.Assistant,
			text: message.text,
			state: _messageState(message.complete, failed)
		};
	});
	const tools = Object.values(state.tools).map(_toolView);
	return { threadId, cursor: state.cursor, runId: state.runId, messages: _attachTools(messages, tools), customEvents: state.customEvents };
}

/** Map message completion and terminal run failure into a display state. */
function _messageState(complete: boolean, failed: boolean): ConversationMessageStates
{
	if (complete) return ConversationMessageStates.Complete;
	return failed ? ConversationMessageStates.Failed : ConversationMessageStates.Loading;
}

/** Detect the server-owned failure signal without interpreting raw backend event JSON. */
function _isFailedReplay(state: AgUiStreamState): boolean
{
	return state.customEvents.includes("opencrane.run_failed");
}

/** Convert one display-safe AG-UI tool lifecycle into a feature tool row. */
function _toolView(tool: AgUiToolView): ConversationToolView
{
	return { id: tool.id, label: tool.name ?? "Tool activity", complete: tool.complete };
}

/** Attach tool activity to the latest assistant row, or create a neutral standalone row. */
function _attachTools(messages: readonly ConversationMessageView[], tools: readonly ConversationToolView[]): readonly ConversationMessageView[]
{
	if (tools.length === 0) return messages;
	if (messages.length === 0)
	{
		return [{
			id: `tools:${tools.map(function _id(tool: ConversationToolView): string { return tool.id; }).join(",")}`,
			role: ConversationMessageRoles.Assistant,
			text: "Tool activity",
			state: tools.every(function _complete(tool: ConversationToolView): boolean { return tool.complete; }) ? ConversationMessageStates.Complete : ConversationMessageStates.Loading,
			tools
		}];
	}
	const next = [...messages];
	const latest = next[next.length - 1];
	if (latest === undefined) return messages;
	next[next.length - 1] = { ...latest, tools };
	return next;
}
