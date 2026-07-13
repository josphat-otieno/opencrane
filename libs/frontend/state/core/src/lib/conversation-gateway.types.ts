import { InjectionToken, Signal } from "@angular/core";

import { AgentOption, ModelOption, SessionSummary, ThreadData, ThreadMessage } from "@opencrane/core";

/** Live connection state for a conversation stream. */
export enum ConnectionStatus
{
	/** No thread opened yet. */
	Idle = "idle",
	/** Establishing the pod session stream. */
	Connecting = "connecting",
	/** Stream is open. */
	Open = "open",
	/** Stream closed. */
	Closed = "closed",
	/**
	 * The socket dropped unexpectedly (transport error or a pod `shutdown`) and the
	 * gateway is retrying with backoff. A *transient* state, distinct from
	 * {@link Closed}: the UI shows an "offline — reconnecting" banner and keeps the
	 * transcript rather than tearing the pane down.
	 */
	Reconnecting = "reconnecting",
	/**
	 * The caller's tenant resolved, but its OpenClaw pod is not paired yet — the
	 * broker has no gateway URL to hand back (HTTP 409 `POD_NOT_READY` from
	 * `/auth/pod-token`). A *transient* provisioning state, distinct from
	 * {@link Refused}: the workspace exists and is being set up, so the UI shows a
	 * "still provisioning" notice with a retry rather than telling the user to ask
	 * an administrator.
	 */
	Provisioning = "provisioning",
	/**
	 * The control plane refused to broker a pod for this identity — no workspace, or
	 * an ambiguous email→tenant mapping (HTTP 403/409 from `/auth/pod-token`). A
	 * terminal state, distinct from {@link Closed} and {@link Provisioning}: the UI
	 * shows "no workspace for this account" rather than offering a reconnect.
	 */
	Refused = "refused"
}

/**
 * Abstraction over a tenant's OpenClaw conversation runtime.
 *
 * The real implementation connects to the pod at `tenant.ingressHost` over the
 * platform's session transport (SSE/WS — see `docs/architecture.md` §3.3, an
 * open question); the gateway URL comes from `POST /auth/pod-token` and the
 * socket is authorised at the ingress against the OIDC session (trusted-proxy).
 * Features depend only on this interface and read its signals, so the transport
 * can be swapped (mock → SSE/WS, web → desktop) without touching feature code.
 */
export interface ConversationGateway
{
	/** Current connection status. */
	readonly status: Signal<ConnectionStatus>;

	/** Metadata of the currently open thread. */
	readonly thread: Signal<ThreadData>;

	/** Messages in the open thread, appended as the stream arrives. */
	readonly messages: Signal<ThreadMessage[]>;

	/** Whether the assistant is currently composing a reply. */
	readonly typing: Signal<boolean>;

	/**
	 * Human-readable status of a long-running operation on the open session
	 * (e.g. "Compacting context"), or null when none is running. Sourced from
	 * `session.operation` events and surfaced inline.
	 */
	readonly operation: Signal<string | null>;

	/**
	 * The agent selected for new sends, or null for the pod default. Sent as
	 * `agentId` on `chat.send`/`chat.abort`. Backs the header agent picker.
	 */
	readonly selectedAgentId: Signal<string | null>;

	/**
	 * The caller's sessions for the sidebar, refreshed whenever the socket opens.
	 * Read this reactively rather than the one-shot {@link listSessions}, so the
	 * sidebar fills in as soon as the connection is live (and on reconnect).
	 */
	readonly sessions: Signal<SessionSummary[]>;

	/**
	 * Whether older history can still be loaded for the open thread.
	 *
	 * Drives the scroll-up "load earlier" affordance. Goes false once the start
	 * of the transcript is reached or the gateway's hard window ceiling (1000
	 * rows) is hit — there is no cursor beyond that.
	 */
	readonly hasMoreHistory: Signal<boolean>;

	/** Whether an older-history page is currently being fetched. */
	readonly loadingHistory: Signal<boolean>;

	/**
	 * Enumerate the caller's sessions for the sidebar lists (mine + shared).
	 *
	 * Backs the workspace sidebar so the session list is swappable mock→live: the
	 * mock resolves the bundled fixture, the live gateway queries the pod. Resolves
	 * an empty array when no sessions are available (e.g. the live transport is not
	 * yet connected) rather than rejecting.
	 */
	listSessions(): Promise<SessionSummary[]>;

	/**
	 * Bring the connection up without opening a specific thread, so the sidebar can
	 * enumerate {@link sessions} on any route (including the blank new-session root,
	 * where no thread — and thus no connection — otherwise exists). Idempotent.
	 */
	ensureConnected(): void;

	/** Open (or switch to) a thread and begin streaming its messages. */
	open(threadId: string): void;

	/** Send a user message to the open thread. */
	send(text: string): void;

	/**
	 * Interrupt the in-flight run for the open thread (`chat.abort`). No-op when
	 * nothing is streaming. The gateway closes the turn locally so the composer
	 * frees up immediately, without waiting for a server acknowledgement.
	 */
	abort(): void;

	/**
	 * Return an in-process A2UI user action (button press, field change, …) to the agent —
	 * the A2UI canvas return path. Best-effort: no-op when the socket is not open. The exact
	 * gateway RPC is verified against a live tenant pod (opencrane #28).
	 */
	sendCanvasAction(action: unknown): void;

	/** Enumerate the pod's model catalogue (`models.list`) for the picker. */
	listModels(): Promise<ModelOption[]>;

	/** Enumerate the pod's agent catalogue (`agents.list`) for the picker. */
	listAgents(): Promise<AgentOption[]>;

	/** Select the agent for subsequent sends (null → pod default). */
	selectAgent(agentId: string | null): void;

	/**
	 * Fetch a single transcript message by id (`chat.message.get`).
	 *
	 * A POINT lookup for a referenced message — the gateway has no cursor, so this
	 * is NOT a way to page arbitrarily far back. Resolves null when the message is
	 * unavailable or the socket is not open.
	 */
	getMessage(messageId: string): Promise<ThreadMessage | null>;

	/**
	 * Load the initial recent window of history for the open thread and hydrate
	 * `messages`. Resets any previously-grown window.
	 */
	history(): Promise<void>;

	/**
	 * Grow the history window by one page and prepend the newly-revealed older
	 * rows. Backs the scroll-up gesture.
	 *
	 * The OpenClaw gateway has no cursor, so this re-fetches a larger *tail*
	 * window (capped at 1000 rows); the view preserves scroll position across the
	 * prepend. No-ops while a fetch is in flight or `hasMoreHistory` is false.
	 */
	loadOlder(): Promise<void>;
}

/** DI token for the active ConversationGateway implementation. */
export const CONVERSATION_GATEWAY: InjectionToken<ConversationGateway> = new InjectionToken<ConversationGateway>("WO_CONVERSATION_GATEWAY");
