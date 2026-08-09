import type { ConversationReplayView } from "./conversation-display.types.js";
import type { ConversationRunStatusView } from "./conversation-run.types.js";

/** Callback invoked by the progress scheduler. */
export interface ConversationProgressTimerCallback
{
	/** Run the scheduled refresh task. */
	(): void;
}

/** Callback invoked when a progress snapshot changes. */
export interface ConversationProgressSnapshotListener
{
	/**
	 * Receive a display-safe progress snapshot.
	 *
	 * @param snapshot - Latest snapshot published by the controller.
	 */
	(snapshot: ConversationProgressSnapshot): void;
}

/** Browser-visible lifecycle states for bounded OpenCrane progress refresh. */
export enum ConversationProgressStates
{
	/** No route thread or admitted run is being followed. */
	Idle = "idle",
	/** The first canonical replay read is in flight. */
	LoadingReplay = "loading_replay",
	/** A run was admitted and is waiting for OpenCrane to start producing output. */
	RunAdmitted = "run_admitted",
	/** OpenCrane reports the run is actively executing. */
	Running = "running",
	/** The run is blocked on a user approval decision. */
	WaitingForApproval = "waiting_for_approval",
	/** The browser is refreshing bounded replay from the server. */
	Refreshing = "refreshing",
	/** A transient refresh failed and the controller will retry with backoff. */
	Reconnecting = "reconnecting",
	/** Replay or status refresh failed and no usable prior state exists. */
	RefreshFailed = "refresh_failed",
	/** OpenCrane reports the run completed. */
	Completed = "completed",
	/** OpenCrane reports the run was cancelled. */
	Cancelled = "cancelled",
	/** OpenCrane reports the run failed. */
	Failed = "failed"
}

/** Browser-safe failure categories for bounded progress refresh. */
export enum ConversationProgressFailures
{
	/** Canonical replay could not be read. */
	ReplayUnavailable = "replay_unavailable",
	/** Owner-visible run status could not be read. */
	RunStatusUnavailable = "run_status_unavailable"
}

/** Polling policy for bounded replay refresh. */
export interface ConversationReplayRefreshPolicy
{
	/** Initial delay between successful non-terminal refreshes. */
	readonly initialDelayMs: number;
	/** Maximum delay after repeated transient failures. */
	readonly maxDelayMs: number;
	/** Backoff multiplier applied after each transient failure. */
	readonly backoffMultiplier: number;
}

/** Input for one bounded progress refresh. */
export interface ConversationProgressRefreshRequest
{
	/** Opaque route thread to refresh. */
	readonly threadId: string;
	/** Latest opaque replay cursor held in memory, when available. */
	readonly cursor?: string | null;
	/** Known run id from admission or a prior replay/status refresh. */
	readonly runId?: string | null;
}

/** Display-safe snapshot emitted by progress refresh. */
export interface ConversationProgressSnapshot
{
	/** Current progress lifecycle state. */
	readonly state: ConversationProgressStates;
	/** Opaque route thread, or null when idle. */
	readonly threadId: string | null;
	/** Current canonical run id, when one is known. */
	readonly runId: string | null;
	/** Latest opaque replay cursor held only in memory. */
	readonly cursor: string | null;
	/** Last display-safe replay view. */
	readonly replay: ConversationReplayView;
	/** Latest owner-visible run status, when available. */
	readonly runStatus?: ConversationRunStatusView;
	/** User-safe failure category when refresh failed. */
	readonly failure?: ConversationProgressFailures;
	/** Whether a retry action can be offered. */
	readonly retryable: boolean;
	/** Whether polling should stop for the current run. */
	readonly terminal: boolean;
	/** Delay planned before the next bounded refresh. */
	readonly nextDelayMs?: number;
}

/** Gateway that combines replay and run-status reads for progress refresh. */
export interface ConversationProgressGateway
{
	/**
	 * Read one bounded replay/status refresh.
	 *
	 * @param request - Opaque thread, optional cursor, and optional known run.
	 * @returns Display-safe progress snapshot.
	 */
	refresh(request: ConversationProgressRefreshRequest): Promise<ConversationProgressSnapshot>;
}

/** Scheduler seam used by progress controller tests. */
export interface ConversationProgressScheduler
{
	/**
	 * Schedule one callback.
	 *
	 * @param callback - Callback to invoke after delay.
	 * @param delayMs - Delay in milliseconds.
	 * @returns Opaque scheduler handle.
	 */
	setTimeout(callback: ConversationProgressTimerCallback, delayMs: number): unknown;

	/**
	 * Cancel one scheduled callback.
	 *
	 * @param handle - Opaque handle returned by `setTimeout`.
	 */
	clearTimeout(handle: unknown): void;
}

/** Options for one progress controller instance. */
export interface ConversationProgressControllerOptions
{
	/** Gateway used for all server-owned progress reads. */
	readonly gateway: ConversationProgressGateway;
	/** Optional refresh policy override. */
	readonly policy?: ConversationReplayRefreshPolicy;
	/** Optional scheduler override for deterministic tests. */
	readonly scheduler?: ConversationProgressScheduler;
	/** Callback invoked every time the controller publishes a snapshot. */
	readonly onSnapshot?: ConversationProgressSnapshotListener;
}

/** Start request for a route-owned progress controller. */
export interface ConversationProgressStartRequest
{
	/** Opaque route thread to follow. */
	readonly threadId: string;
	/** Known admitted run id, when submission just succeeded. */
	readonly runId?: string | null;
}
