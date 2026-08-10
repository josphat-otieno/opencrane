import { describe, expect, it, vi } from "vitest";

import { ConversationMessageRoles, ConversationMessageStates } from "../conversation-display.types.js";
import { ConversationProgressController, __CreateIdleConversationProgressSnapshot } from "../conversation-progress-controller.js";
import { ConversationProgressFailures, ConversationProgressStates, type ConversationProgressGateway, type ConversationProgressRefreshRequest, type ConversationProgressScheduler, type ConversationProgressSnapshot, type ConversationProgressTimerCallback } from "../conversation-progress.types.js";

describe("ConversationProgressController", function _Suite()
{
	it("folds multiple cursor refreshes without duplicating display messages", async function _MergesReplayRefreshes()
	{
		const scheduler = new _ManualScheduler();
		const snapshots = [
			_snapshot("thread-1", "run-1", "cursor-1", "message-1", "First", ConversationProgressStates.Running, false),
			_snapshot("thread-1", "run-1", "cursor-2", "message-1", "First updated", ConversationProgressStates.Running, false),
			_snapshot("thread-1", "run-1", "cursor-3", "message-2", "Second", ConversationProgressStates.Completed, true)
		];
		const gateway = _Gateway(snapshots);
		const controller = new ConversationProgressController({ gateway, scheduler, policy: _POLICY });

		controller.start({ threadId: "thread-1" });
		await _flush();
		scheduler.runNext();
		await _flush();
		scheduler.runNext();
		await _flush();

		expect(gateway.requests[1]).toMatchObject({ threadId: "thread-1", cursor: "cursor-1", runId: "run-1" });
		expect(controller.snapshot().replay.messages.map(function _id(message): string { return message.id; })).toEqual(["message-1", "message-2"]);
		expect(controller.snapshot().replay.messages[0]?.text).toBe("First updated");
		expect(controller.snapshot().terminal).toBe(true);
	});

	it("stops scheduling refreshes when run status is terminal", async function _StopsAtTerminal()
	{
		const scheduler = new _ManualScheduler();
		const controller = new ConversationProgressController({ gateway: _Gateway([_snapshot("thread-1", "run-1", "cursor-1", "message-1", "Done", ConversationProgressStates.Completed, true)]), scheduler, policy: _POLICY });

		controller.start({ threadId: "thread-1" });
		await _flush();
		scheduler.runNext();
		await _flush();

		expect(controller.snapshot().state).toBe(ConversationProgressStates.Completed);
		expect(scheduler.pending()).toBe(0);
	});

	it("reads replay once more after terminal status to catch terminal events", async function _RefreshesReplayAfterTerminal()
	{
		const scheduler = new _ManualScheduler();
		const controller = new ConversationProgressController({
			gateway: _Gateway([
				_snapshot("thread-1", "run-1", "cursor-1", "message-1", "partial", ConversationProgressStates.Failed, true, ConversationMessageStates.Loading),
				_snapshot("thread-1", "run-1", "cursor-2", "message-1", "partial", ConversationProgressStates.Failed, true, ConversationMessageStates.Failed)
			]),
			scheduler,
			policy: _POLICY
		});

		controller.start({ threadId: "thread-1", runId: "run-1" });
		await _flush();

		expect(scheduler.pending()).toBe(1);
		expect(controller.snapshot().replay.messages[0]?.state).toBe(ConversationMessageStates.Loading);

		scheduler.runNext();
		await _flush();

		expect(controller.snapshot().cursor).toBe("cursor-2");
		expect(controller.snapshot().replay.messages[0]?.state).toBe(ConversationMessageStates.Failed);
		expect(scheduler.pending()).toBe(0);
	});

	it("keeps polling a history-seeded run before replay contains run start", async function _PollsHistorySeededRun()
	{
		const scheduler = new _ManualScheduler();
		const gateway = _Gateway([{ ...__CreateIdleConversationProgressSnapshot("thread-1"), state: ConversationProgressStates.RunAdmitted, runId: "run-1", terminal: false }]);
		const controller = new ConversationProgressController({ gateway, scheduler, policy: _POLICY });

		controller.start({ threadId: "thread-1", runId: "run-1" });
		await _flush();

		expect(gateway.requests[0]).toMatchObject({ threadId: "thread-1", runId: "run-1" });
		expect(controller.snapshot().state).toBe(ConversationProgressStates.RunAdmitted);
		expect(scheduler.pending()).toBe(1);
	});

	it("backs off after transient refresh failure", async function _BacksOffAfterFailure()
	{
		const scheduler = new _ManualScheduler();
		const gateway = _Gateway([new Error(ConversationProgressFailures.ReplayUnavailable), new Error(ConversationProgressFailures.ReplayUnavailable)]);
		const controller = new ConversationProgressController({ gateway, scheduler, policy: _POLICY });

		controller.start({ threadId: "thread-1" });
		await _flush();
		scheduler.runNext();
		await _flush();

		expect(controller.snapshot().state).toBe(ConversationProgressStates.RefreshFailed);
		expect(controller.snapshot().retryable).toBe(true);
		expect(scheduler.delays).toEqual([100, 200]);
	});

	it("cancels pending refresh work when stopped", async function _CancelsWhenStopped()
	{
		const scheduler = new _ManualScheduler();
		const controller = new ConversationProgressController({ gateway: _Gateway([_snapshot("thread-1", "run-1", "cursor-1", "message-1", "Running", ConversationProgressStates.Running, false)]), scheduler, policy: _POLICY });

		controller.start({ threadId: "thread-1" });
		await _flush();
		controller.stop();

		expect(scheduler.cancelled).toBe(1);
		expect(controller.snapshot().state).toBe(ConversationProgressStates.Idle);
	});
});

/** Small refresh policy for deterministic tests. */
const _POLICY = { initialDelayMs: 100, maxDelayMs: 800, backoffMultiplier: 2 };

/** Test scheduler that exposes queued callbacks. */
class _ManualScheduler implements ConversationProgressScheduler
{
	/** Delays requested by the controller. */
	public readonly delays: number[] = [];

	/** Number of cancelled timer handles. */
	public cancelled = 0;

	/** Pending callbacks. */
	private readonly _tasks: { readonly callback: ConversationProgressTimerCallback; cancelled: boolean }[] = [];

	/** @inheritdoc */
	public setTimeout(callback: ConversationProgressTimerCallback, delayMs: number): unknown
	{
		const task = { callback, cancelled: false };
		this.delays.push(delayMs);
		this._tasks.push(task);
		return task;
	}

	/** @inheritdoc */
	public clearTimeout(handle: unknown): void
	{
		const task = handle as { cancelled: boolean };
		task.cancelled = true;
		this.cancelled += 1;
	}

	/** Run the next pending callback if it has not been cancelled. */
	public runNext(): void
	{
		const task = this._tasks.shift();
		if (task === undefined || task.cancelled) return;
		task.callback();
	}

	/** Return the number of pending non-cancelled callbacks. */
	public pending(): number
	{
		return this._tasks.filter(function _active(task): boolean { return !task.cancelled; }).length;
	}
}

/** Create a gateway that returns each result once. */
function _Gateway(results: readonly (ConversationProgressSnapshot | Error)[]): ConversationProgressGateway & { readonly requests: ConversationProgressRefreshRequest[] }
{
	const requests: ConversationProgressRefreshRequest[] = [];
	const refresh = vi.fn(async function _refresh(request: ConversationProgressRefreshRequest): Promise<ConversationProgressSnapshot>
	{
		requests.push(request);
		const next = results[requests.length - 1];
		if (next instanceof Error) throw next;
		return next ?? _snapshot(request.threadId, "run-1", "cursor-x", "message-x", "Fallback", ConversationProgressStates.Completed, true);
	});
	return { refresh, requests };
}

/** Create one display-safe progress snapshot. */
function _snapshot(threadId: string, runId: string, cursor: string, messageId: string, text: string, state: ConversationProgressStates, terminal: boolean, messageState: ConversationMessageStates = ConversationMessageStates.Complete): ConversationProgressSnapshot
{
	return {
		state,
		threadId,
		runId,
		cursor,
		replay: {
			threadId,
			runId,
			cursor,
			customEvents: [],
			citations: [],
			files: [],
			memoryReferences: [],
			messages: [{ id: messageId, role: ConversationMessageRoles.Assistant, text, state: messageState }]
		},
		retryable: false,
		terminal
	};
}

/** Flush one resolved async gateway turn. */
async function _flush(): Promise<void>
{
	await Promise.resolve();
	await Promise.resolve();
}
