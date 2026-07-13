import { _RandomId } from "@opencrane/core";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import { Value } from "@sinclair/typebox/value";

import { AgentInfoSchema, ChatEventSchema, FrameSchema, HealthEventSchema, HistoryMessageSchema, ModelInfoSchema, SessionOperationEventSchema, SessionToolEventSchema, ShutdownEventSchema } from "./gateway-protocol.schema";
import { AgentInfo, ChatEvent, Frame, HealthEvent, HistoryMessage, ModelInfo, OpenClawConnectionHandlers, ReqFrame, ResFrame, SessionOperationEvent, SessionToolEvent, ShutdownEvent } from "./gateway-protocol.types";

/** Pre-compiled validator for the protocol frame envelope (hot path). */
const _frameValidator = TypeCompiler.Compile(FrameSchema);

/** Default time to wait for a response frame before rejecting a request. */
const _REQUEST_TIMEOUT_MS = 15_000;

/** Protocol version this client speaks. */
const _PROTOCOL_VERSION = 4;

/** Event the gateway pushes before the `connect` request; our trigger to send it. */
const _CHALLENGE_EVENT = "connect.challenge";

/**
 * Client metadata sent in the `connect` request params.
 *
 * Under trusted-proxy auth the browser is **device-less**: the connection carries
 * no device signature and no token — identity is the proxy-injected
 * `X-Forwarded-User` (https://docs.openclaw.ai/gateway/trusted-proxy-auth). These
 * fields are descriptive metadata only. `scopes` is a *request* (a cap, not a
 * grant): the gateway clears a device-less client's self-declared scopes and grants
 * the session's scopes server-side from the pod's pinned owner identity, so what we
 * ask for here does not elevate the session.
 */
const _CLIENT_VERSION = "weownai";
/**
 * `client.id` and `client.mode` are CLOSED enums in openclaw's ConnectParams schema
 * (`GATEWAY_CLIENT_IDS` / `GATEWAY_CLIENT_MODES`, verified against openclaw@2026.6.9) — NOT
 * free-form. The gateway recognises a browser Control-UI by exactly
 * `id === "openclaw-control-ui"` (CONTROL_UI) + `mode === "webchat"` (WEBCHAT) — its
 * `isControlUiBrowser` predicate. Any other id/mode is rejected with
 * `INVALID_REQUEST: invalid connect params: at /client/id … /client/mode …` and the socket
 * closes before the handshake completes. The per-connection unique id goes in
 * `client.instanceId`, NOT `client.id`.
 */
const _CLIENT_ID = "openclaw-control-ui";
const _CLIENT_MODE = "webchat";
const _CLIENT_ROLE = "operator";
const _CLIENT_SCOPES: readonly string[] = ["operator.read", "operator.write"];
const _CLIENT_PLATFORM = "web";
const _CLIENT_DEVICE_FAMILY = "browser";

/**
 * A fresh, non-persisted per-connection instance id for the `connect` metadata
 * (`client.instanceId`). Trusted-proxy auth binds identity to the proxy-injected header,
 * not to a stable device id, so this is ephemeral per connection — nothing is stored in
 * the browser.
 */
function _NewInstanceId(): string
{
	return `weownai-${_RandomId()}`;
}

/**
 * Whether `url` is a gateway URL we are willing to open.
 *
 * SECURITY (plan.md S5 — Option B, transport hardening) — only `wss://` is
 * accepted. The session cookie (trusted-proxy) and the device assertion travel
 * on the socket, so a downgraded or tampered `ws://` URL would put them on the
 * wire in cleartext. Pure + exported so the rule is unit-tested directly and
 * enforced both here and at the gateway before brokering.
 */
export function _IsSecureGatewayUrl(url: unknown): url is string
{
	return typeof url === "string" && url.startsWith("wss://");
}

/**
 * How to reach a pod gateway.
 *
 * Under trusted-proxy gateway auth (CONN.9/CONN.10) the socket is authorised at the
 * identity-routing proxy, which injects the verified `X-Forwarded-User`; the browser
 * presents **no** token and signs **no** device challenge. The connection therefore
 * needs only the URL — the bootstrap/device-token + device-signing machinery is
 * retired (see `connection-security.md` §0 in the platform repo).
 */
export interface ConnectConfig
{
	/** Gateway WebSocket URL (`wss://…`). */
	url: string;
}

/** A request frame awaiting its matching response. */
interface _PendingRequest
{
	/** Resolve with the matching response frame. */
	resolve: (frame: ResFrame) => void;

	/** Reject on timeout, socket close, or a transport error. */
	reject: (error: Error) => void;

	/** Timer that rejects the request if no response arrives. */
	timer: ReturnType<typeof setTimeout>;
}

/**
 * A TypeBox-validated client for the OpenClaw Gateway v4 WebSocket protocol.
 *
 * Every inbound message is `JSON.parse`d and checked against `FrameSchema`
 * before reaching a handler; frames that fail validation are reported via
 * `onInvalid` and dropped, so malformed or unexpected payloads from the pod can
 * never propagate untyped into application state. Framework-agnostic — the
 * Angular gateway wraps this and maps validated frames onto signals.
 */
export class OpenClawConnection
{
	/** The active socket, or null when disconnected. */
	private _ws: WebSocket | null = null;

	/** Monotonic id source for request frames. */
	private _nextId = 0;

	/** In-flight request frames keyed by id, awaiting their response. */
	private readonly _pending = new Map<string, _PendingRequest>();

	/** Connection config for the in-progress/active session. */
	private _config: ConnectConfig | null = null;

	/**
	 * @param handlers - Consumer callbacks for events, responses, and lifecycle.
	 */
	public constructor(private readonly _handlers: OpenClawConnectionHandlers)
	{
	}

	/** Whether the socket is currently open. */
	public get isOpen(): boolean
	{
		return this._ws?.readyState === WebSocket.OPEN;
	}

	/**
	 * Open a gateway connection and run the `connect` handshake.
	 *
	 * The socket opening is not "ready" — the gateway pushes a `connect.challenge`,
	 * which we answer with a **device-less** `connect` request (no signature, no
	 * token under trusted-proxy auth); only the resulting `hello-ok` fires `onOpen`.
	 */
	public connect(config: ConnectConfig): void
	{
		this.close();
		// Defence in depth: refuse a non-`wss://` endpoint outright so the
		// handshake credential can never travel over cleartext, even if a caller
		// skips the gateway-side check.
		if (!_IsSecureGatewayUrl(config.url))
		{
			this._handlers.onInvalid?.(config.url, "refusing insecure (non-wss) gateway URL");
			return;
		}
		this._config = config;
		const ws = new WebSocket(config.url);
		this._ws = ws;
		ws.addEventListener("close", this._emitClose.bind(this));
		ws.addEventListener("error", this._emitError.bind(this));
		ws.addEventListener("message", this._emitMessage.bind(this));
	}

	/** Socket closed → reject in-flight requests and notify with the close code. */
	private _emitClose(ev: CloseEvent): void
	{
		this._rejectPending("connection closed");
		this._handlers.onClose?.(ev.code);
	}

	/** Socket error → report as an invalid-frame signal. */
	private _emitError(): void
	{
		this._handlers.onInvalid?.(null, "websocket error");
	}

	/** Inbound message → validate and dispatch. */
	private _emitMessage(ev: MessageEvent): void
	{
		this._handleMessage(ev.data);
	}

	/** Send a fire-and-forget request frame and return its generated id. */
	public send(method: string, params?: unknown): string
	{
		const id = `c-${this._nextId++}`;
		const frame: ReqFrame = { type: "req", id, method, params };
		this._ws?.send(JSON.stringify(frame));
		return id;
	}

	/**
	 * Send a request frame and resolve with its matching response.
	 *
	 * Rejects if no response arrives within `timeoutMs`, or if the socket closes
	 * while the request is in flight. The response is still schema-validated by
	 * `_handleMessage` before it resolves here.
	 */
	public request(method: string, params?: unknown, timeoutMs: number = _REQUEST_TIMEOUT_MS): Promise<ResFrame>
	{
		const id = `c-${this._nextId++}`;
		let resolveFn!: (frame: ResFrame) => void;
		let rejectFn!: (error: Error) => void;
		const promise = new Promise<ResFrame>(function executor(resolve, reject): void
		{
			resolveFn = resolve;
			rejectFn = reject;
		});
		const timer = setTimeout(this._timeout.bind(this, id, method), timeoutMs);
		this._pending.set(id, { resolve: resolveFn, reject: rejectFn, timer });
		const frame: ReqFrame = { type: "req", id, method, params };
		this._ws?.send(JSON.stringify(frame));
		return promise;
	}

	/** Reject and drop a pending request that never received a response. */
	private _timeout(id: string, method: string): void
	{
		const pending = this._pending.get(id);
		if (pending)
		{
			this._pending.delete(id);
			pending.reject(new Error(`gateway request '${method}' timed out`));
		}
	}

	/** Reject every in-flight request (used when the socket closes). */
	private _rejectPending(reason: string): void
	{
		this._pending.forEach(function rejectOne(pending: _PendingRequest): void
		{
			clearTimeout(pending.timer);
			pending.reject(new Error(reason));
		});
		this._pending.clear();
	}

	/** Close the socket if open and reject any in-flight requests. */
	public close(): void
	{
		this._rejectPending("connection closed");
		if (this._ws)
		{
			this._ws.close();
			this._ws = null;
		}
	}

	/** Validate a raw inbound message and dispatch it to the right handler. */
	private _handleMessage(data: unknown): void
	{
		let raw: unknown;
		try
		{
			raw = JSON.parse(typeof data === "string" ? data : String(data));
		}
		catch
		{
			this._handlers.onInvalid?.(data, "not valid JSON");
			return;
		}

		if (!_frameValidator.Check(raw))
		{
			const first = _frameValidator.Errors(raw).First();
			this._handlers.onInvalid?.(raw, first ? `${first.path}: ${first.message}` : "frame failed schema validation");
			return;
		}

		const frame = raw as Frame;
		if (frame.type === "event")
		{
			if (frame.event === _CHALLENGE_EVENT)
			{
				// Handshake trigger — the gateway pushes this first on every socket.
				// Consumed internally, never forwarded. Under trusted-proxy we answer
				// with a device-less `connect` (no signature), ignoring the nonce.
				void this._sendConnect();
				return;
			}
			this._handlers.onEvent?.(frame);
		}
		else if (frame.type === "res")
		{
			const pending = this._pending.get(frame.id);
			if (pending)
			{
				this._pending.delete(frame.id);
				clearTimeout(pending.timer);
				pending.resolve(frame);
			}
			else
			{
				this._handlers.onResponse?.(frame);
			}
		}
	}

	/**
	 * Answer a `connect.challenge` with a **device-less** `connect` request and, on
	 * `hello-ok`, surface the ready session via `onOpen`.
	 *
	 * Trusted-proxy auth (CONN.9/CONN.10): the identity-routing proxy injects the
	 * verified `X-Forwarded-User`, so the client sends **no** device signature and
	 * **no** token — only the protocol-negotiation + client-metadata fields, which
	 * the OpenClaw protocol still requires as the first frame
	 * (https://docs.openclaw.ai/gateway/protocol). `client.id` is an ephemeral
	 * per-connection id — nothing persists in the browser.
	 *
	 * NOTE (await live W3 confirmation): whether a device-less session is still sent
	 * a `connect.challenge`, and whether the pod grants the owner identity operator
	 * scopes server-side, are confirmed only against a live gateway.
	 */
	private async _sendConnect(): Promise<void>
	{
		if (!this._config)
		{
			return;
		}
		try
		{
			const params = {
				minProtocol: _PROTOCOL_VERSION,
				maxProtocol: _PROTOCOL_VERSION,
				client: { id: _CLIENT_ID, instanceId: _NewInstanceId(), version: _CLIENT_VERSION, platform: _CLIENT_PLATFORM, mode: _CLIENT_MODE, deviceFamily: _CLIENT_DEVICE_FAMILY },
				role: _CLIENT_ROLE,
				scopes: [..._CLIENT_SCOPES]
			};
			const res = await this.request("connect", params);
			if (!res.ok)
			{
				this._handlers.onInvalid?.(res, `connect rejected: ${res.error?.message ?? "unknown"}`);
				return;
			}
			this._handlers.onOpen?.();
		}
		catch (error)
		{
			this._handlers.onInvalid?.(null, `handshake failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

/**
 * Extract the transcript rows from a `chat.history` response payload.
 *
 * The result envelope is not pinned in the published docs, so this tolerantly
 * accepts a bare array or an object wrapping the rows under `messages`/`items`/
 * `rows`, and keeps only entries that validate as a `HistoryMessage`.
 */
export function _DecodeHistory(payload: unknown): HistoryMessage[]
{
	const container = payload as { messages?: unknown; items?: unknown; rows?: unknown } | null;
	const candidate = Array.isArray(payload)
		? payload
		: container?.messages ?? container?.items ?? container?.rows;
	if (!Array.isArray(candidate))
	{
		return [];
	}
	return candidate.filter(function isHistoryMessage(row: unknown): row is HistoryMessage
	{
		return Value.Check(HistoryMessageSchema, row);
	});
}

/** Validate a `chat` event payload, returning null when it does not match. */
export function _DecodeChatEvent(payload: unknown): ChatEvent | null
{
	return Value.Check(ChatEventSchema, payload) ? payload : null;
}

/** Validate a `session.tool` event payload, returning null when it does not match. */
export function _DecodeSessionTool(payload: unknown): SessionToolEvent | null
{
	return Value.Check(SessionToolEventSchema, payload) ? payload : null;
}

/** Validate a `session.operation` event payload, returning null when it does not match. */
export function _DecodeSessionOperation(payload: unknown): SessionOperationEvent | null
{
	return Value.Check(SessionOperationEventSchema, payload) ? payload : null;
}

/** Validate a `health` event payload, returning null when it does not match. */
export function _DecodeHealth(payload: unknown): HealthEvent | null
{
	return Value.Check(HealthEventSchema, payload) ? payload : null;
}

/** Validate a `shutdown` event payload, returning null when it does not match. */
export function _DecodeShutdown(payload: unknown): ShutdownEvent | null
{
	return Value.Check(ShutdownEventSchema, payload) ? payload : null;
}

/**
 * Extract the model catalogue rows from a `models.list` response payload.
 *
 * The response wraps the rows under `models` (verified against openclaw@2026.6.9),
 * but this tolerantly also accepts a bare array; only entries validating as a
 * {@link ModelInfo} are kept.
 */
export function _DecodeModelList(payload: unknown): ModelInfo[]
{
	const container = payload as { models?: unknown } | null;
	const candidate = Array.isArray(payload) ? payload : container?.models;
	if (!Array.isArray(candidate))
	{
		return [];
	}
	return candidate.filter((row: unknown): row is ModelInfo => Value.Check(ModelInfoSchema, row));
}

/**
 * Extract the agent catalogue rows from an `agents.list` response payload.
 *
 * The response wraps the rows under `agents`, but this tolerantly also accepts a
 * bare array; only entries validating as an {@link AgentInfo} are kept.
 */
export function _DecodeAgentList(payload: unknown): AgentInfo[]
{
	const container = payload as { agents?: unknown } | null;
	const candidate = Array.isArray(payload) ? payload : container?.agents;
	if (!Array.isArray(candidate))
	{
		return [];
	}
	return candidate.filter((row: unknown): row is AgentInfo => Value.Check(AgentInfoSchema, row));
}
