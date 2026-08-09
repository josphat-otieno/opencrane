import { __CreateEmptyConversationReplayView } from "./opencrane-conversation-replay-reader.js";
import { ConversationProgressFailures, ConversationProgressStates, type ConversationProgressControllerOptions, type ConversationProgressGateway, type ConversationProgressScheduler, type ConversationProgressSnapshot, type ConversationProgressSnapshotListener, type ConversationProgressStartRequest, type ConversationProgressTimerCallback, type ConversationReplayRefreshPolicy } from "./conversation-progress.types.js";
import type { ConversationMessageView, ConversationReplayView } from "./conversation-display.types.js";

/** Default bounded refresh policy for user-facing conversation progress. */
const _DEFAULT_REFRESH_POLICY: ConversationReplayRefreshPolicy = { initialDelayMs: 1000, maxDelayMs: 8000, backoffMultiplier: 2 };

/** Browser scheduler backed by `globalThis` timers. */
const _DEFAULT_SCHEDULER: ConversationProgressScheduler = {
	setTimeout: function _setTimeout(callback: ConversationProgressTimerCallback, delayMs: number): unknown
	{
		return globalThis.setTimeout(callback, delayMs);
	},
	clearTimeout: function _clearTimeout(handle: unknown): void
	{
		globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
	}
};

/** Create an idle snapshot for route setup and teardown. */
export function __CreateIdleConversationProgressSnapshot(threadId: string | null): ConversationProgressSnapshot
{
	return {
		state: ConversationProgressStates.Idle,
		threadId,
		runId: null,
		cursor: null,
		replay: __CreateEmptyConversationReplayView(threadId),
		retryable: false,
		terminal: true
	};
}

/** Owns bounded replay/status refresh, cursor reuse, backoff, and cancellation. */
export class ConversationProgressController
{
	/** Gateway used for every server-owned refresh. */
	private readonly _gateway: ConversationProgressGateway;

	/** Polling/backoff policy for bounded refresh. */
	private readonly _policy: ConversationReplayRefreshPolicy;

	/** Scheduler seam for timers. */
	private readonly _scheduler: ConversationProgressScheduler;

	/** Optional subscriber for state publication. */
	private readonly _onSnapshot?: ConversationProgressSnapshotListener;

	/** Current controller generation used to ignore stale async refreshes. */
	private _generation = 0;

	/** Current route request, when a thread is active. */
	private _request: ConversationProgressStartRequest | null = null;

	/** Last published snapshot. */
	private _snapshot: ConversationProgressSnapshot = __CreateIdleConversationProgressSnapshot(null);

	/** Current scheduled refresh handle. */
	private _timer: unknown | null = null;

	/** Number of consecutive transient refresh failures. */
	private _failureCount = 0;

	/** Whether the controller already did the final replay refresh after terminal status. */
	private _terminalReplayRefreshUsed = false;

	/**
	 * Construct one progress controller.
	 *
	 * @param options - Gateway, policy, scheduler, and publication callback.
	 */
	public constructor(options: ConversationProgressControllerOptions)
	{
		this._gateway = options.gateway;
		this._policy = options.policy ?? _DEFAULT_REFRESH_POLICY;
		this._scheduler = options.scheduler ?? _DEFAULT_SCHEDULER;
		this._onSnapshot = options.onSnapshot;
	}

	/** Return the latest display-safe snapshot. */
	public snapshot(): ConversationProgressSnapshot
	{
		return this._snapshot;
	}

	/**
	 * Start following one route thread.
	 *
	 * @param request - Thread and optional already-admitted run.
	 */
	public start(request: ConversationProgressStartRequest): void
	{
		this.stop();
		this._request = request;
		this._failureCount = 0;
		this._terminalReplayRefreshUsed = false;
		this._publish({ ...__CreateIdleConversationProgressSnapshot(request.threadId), state: ConversationProgressStates.LoadingReplay, terminal: false });
		void this._refresh();
	}

	/** Retry immediately using the last known route/run/cursor state. */
	public retry(): void
	{
		if (this._request === null) return;
		this._clearTimer();
		this._failureCount = 0;
		void this._refresh();
	}

	/** Stop polling and publish an idle snapshot for the current route. */
	public stop(): void
	{
		this._generation += 1;
		this._clearTimer();
		const threadId = this._request?.threadId ?? null;
		this._request = null;
		this._publish(__CreateIdleConversationProgressSnapshot(threadId));
	}

	/** Read replay/status once and schedule the next bounded refresh when needed. */
	private async _refresh(): Promise<void>
	{
		this._timer = null;
		const request = this._request;
		if (request === null) return;
		const generation = this._generation;
		try
		{
			if (this._snapshot.state !== ConversationProgressStates.LoadingReplay)
			{
				this._publish({ ...this._snapshot, state: ConversationProgressStates.Refreshing, retryable: false, terminal: false });
			}
			const next = await this._gateway.refresh({ threadId: request.threadId, runId: request.runId ?? this._snapshot.runId, cursor: this._snapshot.cursor });
			if (generation !== this._generation) return;
			this._failureCount = 0;
			const previous = this._snapshot;
			const snapshot = _mergeSnapshots(this._snapshot, next);
			this._publish(snapshot);
			if (_shouldRefreshTerminalReplay(previous, snapshot, this._terminalReplayRefreshUsed))
			{
				this._terminalReplayRefreshUsed = true;
				this._schedule(0);
				return;
			}
			if (!snapshot.terminal && snapshot.runId !== null) this._schedule(this._policy.initialDelayMs);
		}
		catch (error)
		{
			if (generation !== this._generation) return;
			const delayMs = this._backoffDelay();
			const state = this._snapshot.replay.messages.length === 0 ? ConversationProgressStates.RefreshFailed : ConversationProgressStates.Reconnecting;
			this._publish({ ...this._snapshot, state, failure: _failureForError(error), retryable: true, terminal: false, nextDelayMs: delayMs });
			this._schedule(delayMs);
		}
	}

	/** Compute exponential backoff while keeping the user-facing poll gentle. */
	private _backoffDelay(): number
	{
		this._failureCount += 1;
		const exponent = Math.max(0, this._failureCount - 1);
		const delay = this._policy.initialDelayMs * Math.pow(this._policy.backoffMultiplier, exponent);
		return Math.min(delay, this._policy.maxDelayMs);
	}

	/** Schedule the next refresh and own the returned cancellation handle. */
	private _schedule(delayMs: number): void
	{
		this._clearTimer();
		this._timer = this._scheduler.setTimeout(this._refresh.bind(this), delayMs);
	}

	/** Cancel one pending timer when route state changes. */
	private _clearTimer(): void
	{
		if (this._timer === null) return;
		this._scheduler.clearTimeout(this._timer);
		this._timer = null;
	}

	/** Publish a snapshot to local state and the optional subscriber. */
	private _publish(snapshot: ConversationProgressSnapshot): void
	{
		this._snapshot = snapshot;
		this._onSnapshot?.(snapshot);
	}
}

/** Decide whether a terminal status needs one final replay read to catch terminal events. */
function _shouldRefreshTerminalReplay(previous: ConversationProgressSnapshot, next: ConversationProgressSnapshot, terminalReplayRefreshUsed: boolean): boolean
{
	return !terminalReplayRefreshUsed && !previous.terminal && next.terminal && next.runId !== null;
}

/** Convert gateway failures into user-safe progress categories. */
function _failureForError(error: unknown): ConversationProgressFailures
{
	if (error instanceof Error && error.message === ConversationProgressFailures.RunStatusUnavailable) return ConversationProgressFailures.RunStatusUnavailable;
	return ConversationProgressFailures.ReplayUnavailable;
}

/** Merge cursor-based replay deltas into the prior display-safe replay view. */
function _mergeSnapshots(previous: ConversationProgressSnapshot, next: ConversationProgressSnapshot): ConversationProgressSnapshot
{
	const replay = _mergeReplay(previous.replay, next.replay);
	return {
		...next,
		runId: next.runId ?? previous.runId,
		cursor: replay.cursor,
		replay
	};
}

/** Merge full or cursor-resumed replay results without duplicating display messages. */
function _mergeReplay(previous: ConversationReplayView, next: ConversationReplayView): ConversationReplayView
{
	const messages = new Map<string, ConversationMessageView>();
	for (const message of previous.messages) messages.set(message.id, message);
	for (const message of next.messages) messages.set(message.id, message);
	return {
		threadId: next.threadId ?? previous.threadId,
		cursor: next.cursor ?? previous.cursor,
		runId: next.runId ?? previous.runId,
		messages: [...messages.values()],
		customEvents: [...new Set([...previous.customEvents, ...next.customEvents])]
	};
}
