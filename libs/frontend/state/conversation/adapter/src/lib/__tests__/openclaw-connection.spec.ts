import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenClawConnection, _DecodeChatEvent, _DecodeHistory, _DecodeSessionTool, _IsSecureGatewayUrl } from "../openclaw-connection";
import type { EventFrame, OpenClawConnectionHandlers, ResFrame } from "../gateway-protocol.types";

/** Minimal controllable WebSocket stand-in for the connection tests. */
class MockWebSocket
{
	public static OPEN = 1;
	public static CLOSED = 3;
	public static last: MockWebSocket | null = null;

	public readyState = MockWebSocket.OPEN;
	public sent: string[] = [];
	private _listeners: Record<string, Array<(ev: unknown) => void>> = {};

	public constructor(public url: string)
	{
		MockWebSocket.last = this;
	}

	public addEventListener(type: string, cb: (ev: unknown) => void): void
	{
		(this._listeners[type] ??= []).push(cb);
	}

	public send(data: string): void
	{
		this.sent.push(data);
	}

	public close(): void
	{
		this.readyState = MockWebSocket.CLOSED;
		this.emit("close", { code: 1000 });
	}

	public emit(type: string, ev: unknown): void
	{
		(this._listeners[type] ?? []).forEach((cb) => cb(ev));
	}

	/** Deliver a JSON frame as an inbound message. */
	public deliver(frame: unknown): void
	{
		this.emit("message", { data: JSON.stringify(frame) });
	}

	/** Deliver a raw (possibly non-JSON) message payload. */
	public deliverRaw(data: string): void
	{
		this.emit("message", { data });
	}

	/** Parsed view of everything the client has sent. */
	public get sentFrames(): Array<{ type: string; id: string; method?: string; params?: Record<string, unknown> }>
	{
		return this.sent.map((s) => JSON.parse(s));
	}
}

/** Flush pending microtasks/timers. */
function _flush(): Promise<void>
{
	return new Promise(function settle(resolve): void { setTimeout(resolve, 0); });
}

function _connect(handlers: OpenClawConnectionHandlers): { conn: OpenClawConnection; ws: MockWebSocket }
{
	const conn = new OpenClawConnection(handlers);
	conn.connect({ url: "wss://pod.example/gateway" });
	const ws = MockWebSocket.last;
	if (!ws)
	{
		throw new Error("MockWebSocket was not constructed");
	}
	return { conn, ws };
}

describe("OpenClawConnection", () =>
{
	beforeEach(() =>
	{
		(globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket;
		MockWebSocket.last = null;
	});

	afterEach(() =>
	{
		vi.useRealTimers();
	});

	it("answers connect.challenge with a device-less connect, fires onOpen on hello-ok", async () =>
	{
		let opened = false;
		const { ws } = _connect({ onOpen: () => { opened = true; } });

		ws.deliver({ type: "event", event: "connect.challenge", payload: { nonce: "n1" } });
		await _flush();

		const connectReq = ws.sentFrames.find((f) => f.method === "connect");
		if (!connectReq)
		{
			throw new Error("client did not send a connect request");
		}
		// Trusted-proxy: no device signature, no auth token — identity is the
		// proxy-injected header. Only protocol-negotiation + client metadata travel.
		expect(connectReq.params?.["device"]).toBeUndefined();
		expect(connectReq.params?.["auth"]).toBeUndefined();
		expect(connectReq.params?.["role"]).toBe("operator");
		// client.id + client.mode are CLOSED enums in openclaw's ConnectParams; a browser Control-UI
		// MUST send id="openclaw-control-ui" + mode="webchat" or the gateway rejects with INVALID_REQUEST.
		// The per-connection UUID goes in instanceId, NOT id. (Regression guard for the connect-param bug.)
		const client = connectReq.params?.["client"] as { id?: string; mode?: string; instanceId?: string };
		expect(client.id).toBe("openclaw-control-ui");
		expect(client.mode).toBe("webchat");
		expect(client.instanceId).toBeTruthy();

		ws.deliver({ type: "res", id: connectReq.id, ok: true, payload: { auth: { scopes: ["operator.read"] }, protocol: 4 } });
		await _flush();

		expect(opened).toBe(true);
	});

	it("surfaces a rejected connect via onInvalid and does not open", async () =>
	{
		let opened = false;
		let reason: string | undefined;
		const { ws } = _connect({ onOpen: () => { opened = true; }, onInvalid: (_raw, r) => { reason = r; } });

		ws.deliver({ type: "event", event: "connect.challenge", payload: { nonce: "n1" } });
		await _flush();
		const connectReq = ws.sentFrames.find((f) => f.method === "connect");
		ws.deliver({ type: "res", id: connectReq?.id ?? "c-0", ok: false, error: { message: "forbidden" } });
		await _flush();

		expect(opened).toBe(false);
		expect(reason).toMatch(/connect rejected/);
	});

	it("does not forward the connect.challenge event to onEvent", async () =>
	{
		let events = 0;
		const { ws } = _connect({ onEvent: () => { events++; } });
		ws.deliver({ type: "event", event: "connect.challenge", payload: { nonce: "n1" } });
		await _flush();
		expect(events).toBe(0);
	});

	it("dispatches a validated chat event to onEvent", () =>
	{
		let received: EventFrame | undefined;
		const { ws } = _connect({ onEvent: (f) => { received = f; } });
		ws.deliver({ type: "event", event: "chat", payload: { deltaText: "hi" } });
		expect(received?.event).toBe("chat");
	});

	it("reports non-JSON messages via onInvalid", () =>
	{
		let reason: string | undefined;
		const { ws } = _connect({ onInvalid: (_raw, r) => { reason = r; } });
		ws.deliverRaw("definitely not json {");
		expect(reason).toBe("not valid JSON");
	});

	it("reports a JSON message that fails frame validation via onInvalid", () =>
	{
		let called = false;
		const { ws } = _connect({ onInvalid: () => { called = true; } });
		ws.deliver({ type: "nope" });
		expect(called).toBe(true);
	});

	it("resolves request() with the matching response frame", async () =>
	{
		const { conn, ws } = _connect({});
		const pending = conn.request("chat.history", { sessionKey: "t1" });

		const sent = JSON.parse(ws.sent[0]) as { type: string; id: string; method: string };
		expect(sent.type).toBe("req");
		expect(sent.method).toBe("chat.history");

		ws.deliver({ type: "res", id: sent.id, ok: true, payload: { messages: [] } });
		const res: ResFrame = await pending;
		expect(res.ok).toBe(true);
	});

	it("rejects request() after the timeout elapses", async () =>
	{
		vi.useFakeTimers();
		const { conn } = _connect({});
		const pending = conn.request("chat.history", undefined, 1000);
		const assertion = expect(pending).rejects.toThrow(/timed out/);
		await vi.advanceTimersByTimeAsync(1001);
		await assertion;
	});

	it("rejects in-flight requests when the socket closes", async () =>
	{
		const { conn, ws } = _connect({});
		const pending = conn.request("chat.history");
		ws.close();
		await expect(pending).rejects.toThrow(/closed/);
	});

	it("refuses a non-wss gateway URL without opening a socket", () =>
	{
		let reason: string | undefined;
		const conn = new OpenClawConnection({ onInvalid: (_raw, r) => { reason = r; } });
		MockWebSocket.last = null;
		conn.connect({ url: "ws://pod.example/gateway" });
		expect(MockWebSocket.last).toBeNull();
		expect(reason).toMatch(/non-wss/);
	});
});

describe("_IsSecureGatewayUrl", () =>
{
	it("accepts a wss:// URL", () =>
	{
		expect(_IsSecureGatewayUrl("wss://pod.example/gateway")).toBe(true);
	});

	it("rejects ws://, https://, and non-string inputs", () =>
	{
		expect(_IsSecureGatewayUrl("ws://pod.example/gateway")).toBe(false);
		expect(_IsSecureGatewayUrl("https://pod.example/gateway")).toBe(false);
		expect(_IsSecureGatewayUrl(undefined)).toBe(false);
		expect(_IsSecureGatewayUrl(42)).toBe(false);
	});
});

describe("_DecodeHistory", () =>
{
	const row = { id: "m1", role: "user", text: "hello" };

	it("reads a bare array of rows", () =>
	{
		expect(_DecodeHistory([row])).toHaveLength(1);
	});

	it("reads rows wrapped under messages / items / rows", () =>
	{
		expect(_DecodeHistory({ messages: [row] })).toHaveLength(1);
		expect(_DecodeHistory({ items: [row] })).toHaveLength(1);
		expect(_DecodeHistory({ rows: [row] })).toHaveLength(1);
	});

	it("returns an empty array for unrecognised payloads", () =>
	{
		expect(_DecodeHistory(null)).toEqual([]);
		expect(_DecodeHistory({ nope: 1 })).toEqual([]);
		expect(_DecodeHistory(42)).toEqual([]);
	});
});

describe("_DecodeChatEvent", () =>
{
	it("accepts an incremental delta", () =>
	{
		expect(_DecodeChatEvent({ deltaText: "hi", seq: 1 })?.deltaText).toBe("hi");
	});

	it("accepts a cumulative message snapshot with a done flag", () =>
	{
		const ev = _DecodeChatEvent({ message: "full answer", done: true });
		expect(ev?.message).toBe("full answer");
		expect(ev?.done).toBe(true);
	});

	it("returns null for a non-object payload", () =>
	{
		expect(_DecodeChatEvent(42)).toBeNull();
	});
});

describe("_DecodeSessionTool", () =>
{
	it("reads a tool name and status", () =>
	{
		const ev = _DecodeSessionTool({ name: "web_search", status: "running" });
		expect(ev?.name).toBe("web_search");
		expect(ev?.status).toBe("running");
	});
});
