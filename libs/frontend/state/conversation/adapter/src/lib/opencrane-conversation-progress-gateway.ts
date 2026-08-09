import { Injectable, inject } from "@angular/core";

import { CONVERSATION_REPLAY_GATEWAY, CONVERSATION_RUN_GATEWAY } from "./conversation-gateway.tokens.js";
import { ConversationProgressFailures, ConversationProgressStates, type ConversationProgressGateway, type ConversationProgressRefreshRequest, type ConversationProgressSnapshot } from "./conversation-progress.types.js";
import { ConversationRunLifecycleStates, type ConversationRunStatusView } from "./conversation-run.types.js";
import type { ConversationReplayView } from "./conversation-display.types.js";

/** Live bounded-refresh gateway for OpenCrane conversation progress. */
@Injectable()
export class OpenCraneConversationProgressGateway implements ConversationProgressGateway
{
	/** Canonical replay reader for display-safe server events. */
	private readonly _replayGateway = inject(CONVERSATION_REPLAY_GATEWAY);

	/** Owner-visible run status reader. */
	private readonly _runGateway = inject(CONVERSATION_RUN_GATEWAY);

	/** @inheritdoc */
	public async refresh(request: ConversationProgressRefreshRequest): Promise<ConversationProgressSnapshot>
	{
		// 1. Read canonical replay first so display content remains server-owned.
		const replay = await this._readReplay(request);

		// 2. Resolve the current run id from admission state or replay state.
		const runId = request.runId ?? replay.runId;
		if (runId === null || runId === undefined) return _snapshot(ConversationProgressStates.Idle, replay, null);

		// 3. Read owner-visible lifecycle only as status, never as message content.
		const runStatus = await this._readMatchingRunStatus(request.threadId, replay, runId);
		if (runStatus === null) return _snapshot(ConversationProgressStates.Idle, replay, null);
		return _snapshot(_stateForRun(runStatus.state), replay, runStatus);
	}

	/** Read replay by cursor and fall back to a full bounded replay if cursor resume fails. */
	private async _readReplay(request: ConversationProgressRefreshRequest): Promise<ConversationReplayView>
	{
		try
		{
			return await this._replayGateway.read(request.threadId, request.cursor ?? undefined);
		}
		catch
		{
			if (request.cursor === null || request.cursor === undefined) throw new Error(ConversationProgressFailures.ReplayUnavailable);
			return this._replayGateway.read(request.threadId);
		}
	}

	/** Read run status and expose only a progress failure category on transport failure. */
	private async _readRunStatus(runId: string): Promise<ConversationRunStatusView>
	{
		try
		{
			return await this._runGateway.getRunStatus(runId);
		}
		catch
		{
			throw new Error(ConversationProgressFailures.RunStatusUnavailable);
		}
	}

	/** Read status only when it belongs to the selected route thread. */
	private async _readMatchingRunStatus(threadId: string, replay: ConversationReplayView, runId: string): Promise<ConversationRunStatusView | null>
	{
		const preferred = await this._readRunStatus(runId);
		if (preferred.threadId === threadId) return preferred;
		if (replay.runId === null || replay.runId === runId) return null;
		const replayRunStatus = await this._readRunStatus(replay.runId);
		if (replayRunStatus.threadId === threadId) return replayRunStatus;
		return null;
	}
}

/** Create a display-safe progress snapshot from replay and optional run status. */
function _snapshot(state: ConversationProgressStates, replay: ConversationReplayView, runStatus: ConversationRunStatusView | null): ConversationProgressSnapshot
{
	const terminal = _terminalState(state);
	return {
		state,
		threadId: replay.threadId,
		runId: runStatus?.runId ?? replay.runId,
		cursor: replay.cursor,
		replay,
		...(runStatus === null ? {} : { runStatus }),
		retryable: state === ConversationProgressStates.RefreshFailed || state === ConversationProgressStates.Reconnecting,
		terminal
	};
}

/** Map public run lifecycle into progress UI state. */
function _stateForRun(state: ConversationRunLifecycleStates): ConversationProgressStates
{
	switch (state)
	{
		case ConversationRunLifecycleStates.Accepted:
		case ConversationRunLifecycleStates.Queued:
		case ConversationRunLifecycleStates.Assigned:
			return ConversationProgressStates.RunAdmitted;
		case ConversationRunLifecycleStates.Running:
		case ConversationRunLifecycleStates.Cancelling:
			return ConversationProgressStates.Running;
		case ConversationRunLifecycleStates.WaitingForApproval:
			return ConversationProgressStates.WaitingForApproval;
		case ConversationRunLifecycleStates.Completed:
			return ConversationProgressStates.Completed;
		case ConversationRunLifecycleStates.Failed:
			return ConversationProgressStates.Failed;
		case ConversationRunLifecycleStates.Cancelled:
			return ConversationProgressStates.Cancelled;
	}
	const unhandled: never = state;
	return unhandled;
}

/** Return whether one progress state should stop bounded polling. */
function _terminalState(state: ConversationProgressStates): boolean
{
	switch (state)
	{
		case ConversationProgressStates.Completed:
		case ConversationProgressStates.Failed:
		case ConversationProgressStates.Cancelled:
		case ConversationProgressStates.Idle:
			return true;
		case ConversationProgressStates.LoadingReplay:
		case ConversationProgressStates.RunAdmitted:
		case ConversationProgressStates.Running:
		case ConversationProgressStates.WaitingForApproval:
		case ConversationProgressStates.Refreshing:
		case ConversationProgressStates.Reconnecting:
		case ConversationProgressStates.RefreshFailed:
			return false;
	}
	const unhandled: never = state;
	return unhandled;
}
