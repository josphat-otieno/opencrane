import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";

import { _HandleControlUiRequest, _HandleUpgrade, _IsControlUiRequest, _StripGatewayPrefix } from "../../gateway-proxy/proxy.js";
import type { ControlUiDeps, UpgradeDeps, WebProxy, WsProxy, GatewayProxyRuntime } from "../../gateway-proxy/proxy.js";
import type { ResolveOutcome } from "../../gateway-proxy/auth-client.js";
import { FixedWindowRateLimiter } from "../../gateway-proxy/rate-limit.js";

const log = pino({ level: "silent" });

/** A fake upgrade socket recording writes + destroy. */
function _fakeSocket(): Duplex & { written: string[]; destroyed: boolean }
{
  const written: string[] = [];
  const socket = {
    written,
    destroyed: false,
    write(chunk: string) { written.push(chunk); return true; },
    destroy() { (socket as { destroyed: boolean }).destroyed = true; },
  };
  return socket as unknown as Duplex & { written: string[]; destroyed: boolean };
}

/** A fake WS proxy recording forward targets + injected headers. */
function _fakeProxy(): WsProxy & { targets: string[]; headers: Array<Record<string, string> | undefined> }
{
  const targets: string[] = [];
  const headers: Array<Record<string, string> | undefined> = [];
  return {
    targets,
    headers,
    ws(_req, _socket, _head, options) { targets.push(options.target); headers.push(options.headers); },
  };
}

const baseConfig: GatewayProxyRuntime = {
  controlPlaneUrl: "http://cp:3000",
  gatewayPort: 18789,
  clusterDomain: "svc.cluster.local",
  userHeader: "X-Forwarded-User",
  allowedOrigins: [],
  allowedOriginBaseDomains: ["opencrane.ai"],
};

const okTarget: ResolveOutcome = {
  ok: true,
  target: {
    user: { email: "alice@example.com", sub: "sub-1" },
    tenant: { name: "alice", clusterTenantRef: "acme" },
    podService: { name: "openclaw-alice", namespace: "opencrane-acme" },
  },
};

function _deps(resolve: UpgradeDeps["resolve"], rateLimit = 60): { deps: UpgradeDeps; proxy: ReturnType<typeof _fakeProxy> }
{
  const proxy = _fakeProxy();
  const deps: UpgradeDeps = { config: baseConfig, proxy, limiter: new FixedWindowRateLimiter(rateLimit, () => 1_000), log, resolve };
  return { deps, proxy };
}

function _req(headers: Record<string, string | undefined>): IncomingMessage
{
  return { headers, url: "/", socket: { remoteAddress: "10.0.0.1" } } as unknown as IncomingMessage;
}

describe("_HandleUpgrade (in-operator gateway proxy)", () =>
{
  it("authorises an org-host origin, injects the verified identity, and proxies to the pod", async () =>
  {
    const resolve = vi.fn().mockResolvedValue(okTarget);
    const { deps, proxy } = _deps(resolve);
    const socket = _fakeSocket();
    const req = _req({ origin: "https://acme.opencrane.ai", host: "acme.opencrane.ai", cookie: "sid=x", "x-forwarded-user": "attacker@evil.com" });

    await _HandleUpgrade(deps, req, socket, Buffer.alloc(0));

    expect(proxy.targets).toEqual(["ws://openclaw-alice.opencrane-acme.svc.cluster.local:18789"]);
    expect(proxy.headers[0]?.["X-Forwarded-User"]).toBe("alice@example.com");
    expect(req.headers["x-forwarded-user"]).toBeUndefined();
    expect(socket.destroyed).toBe(false);
    // The org host is forwarded so the control plane can scope resolution to this silo.
    expect(resolve).toHaveBeenCalledWith("http://cp:3000", "sid=x", "acme.opencrane.ai", expect.any(AbortSignal));
  });

  it("caps the session to chat-only scopes and strips a client-supplied scopes header", async () =>
  {
    const resolve = vi.fn().mockResolvedValue(okTarget);
    const { deps, proxy } = _deps(resolve);
    // A client tries to self-declare admin scopes on the upgrade.
    const req = _req({ origin: "https://acme.opencrane.ai", host: "acme.opencrane.ai", cookie: "sid=x", "x-openclaw-scopes": "operator.admin" });

    await _HandleUpgrade(deps, req, _fakeSocket(), Buffer.alloc(0));

    // The proxy injects the chat-only cap (operator.read/write, no admin)…
    expect(proxy.headers[0]?.["x-openclaw-scopes"]).toBe("operator.read operator.write");
    // …and the client's self-declared header never reaches the pod.
    expect(req.headers["x-openclaw-scopes"]).toBeUndefined();
  });

  it("forwards x-forwarded-host (first value) over the Host header when both are present", async () =>
  {
    const resolve = vi.fn().mockResolvedValue(okTarget);
    const { deps } = _deps(resolve);
    const req = _req({ origin: "https://acme.opencrane.ai", host: "internal:8090", "x-forwarded-host": "acme.opencrane.ai, proxy.internal", cookie: "sid=x" });

    await _HandleUpgrade(deps, req, _fakeSocket(), Buffer.alloc(0));

    expect(resolve).toHaveBeenCalledWith("http://cp:3000", "sid=x", "acme.opencrane.ai", expect.any(AbortSignal));
  });

  it("refuses (403) a non-allowlisted origin without calling the control plane (CSWSH)", async () =>
  {
    const resolve = vi.fn().mockResolvedValue(okTarget);
    const { deps, proxy } = _deps(resolve);
    const socket = _fakeSocket();

    await _HandleUpgrade(deps, _req({ origin: "https://evil.example.com", cookie: "sid=x" }), socket, Buffer.alloc(0));

    expect(resolve).not.toHaveBeenCalled();
    expect(proxy.targets).toEqual([]);
    expect(socket.written[0]).toMatch(/^HTTP\/1\.1 403 Forbidden/);
    expect(socket.destroyed).toBe(true);
  });

  it("propagates a control-plane refusal and rate-limits per identity", async () =>
  {
    const denied = _deps(vi.fn().mockResolvedValue({ ok: false, status: 403, reason: "no tenant" } as ResolveOutcome));
    const s1 = _fakeSocket();
    await _HandleUpgrade(denied.deps, _req({ origin: "https://acme.opencrane.ai", cookie: "x" }), s1, Buffer.alloc(0));
    expect(s1.written[0]).toMatch(/^HTTP\/1\.1 403/);
    expect(denied.proxy.targets).toEqual([]);

    const limited = _deps(vi.fn().mockResolvedValue(okTarget), 1);
    const a = _fakeSocket(); const b = _fakeSocket();
    await _HandleUpgrade(limited.deps, _req({ origin: "https://acme.opencrane.ai", cookie: "x" }), a, Buffer.alloc(0));
    await _HandleUpgrade(limited.deps, _req({ origin: "https://acme.opencrane.ai", cookie: "x" }), b, Buffer.alloc(0));
    expect(limited.proxy.targets).toHaveLength(1);
    expect(b.written[0]).toMatch(/^HTTP\/1\.1 429/);
  });

  it("strips the /gateway routing prefix before forwarding so the pod sees the path it expects", async () =>
  {
    const resolve = vi.fn().mockResolvedValue(okTarget);
    const { deps } = _deps(resolve);
    // The org host routes the WS at /gateway (the SPA owns /); the pod gateway listens at /.
    const req = { headers: { origin: "https://acme.opencrane.ai", host: "acme.opencrane.ai", cookie: "x" }, url: "/gateway", socket: { remoteAddress: "10.0.0.1" } } as unknown as IncomingMessage;

    await _HandleUpgrade(deps, req, _fakeSocket(), Buffer.alloc(0));

    expect(req.url).toBe("/");
  });
});

describe("_StripGatewayPrefix", () =>
{
  it("strips a leading /gateway segment, preserving the remainder and query", () =>
  {
    expect(_StripGatewayPrefix("/gateway")).toBe("/");
    expect(_StripGatewayPrefix("/gateway/")).toBe("/");
    expect(_StripGatewayPrefix("/gateway/socket")).toBe("/socket");
    expect(_StripGatewayPrefix("/gateway?token=x")).toBe("/?token=x");
  });

  it("leaves a non-prefixed path untouched (backward-compatible with a bare / client)", () =>
  {
    expect(_StripGatewayPrefix("/")).toBe("/");
    expect(_StripGatewayPrefix("/api")).toBe("/api");
    expect(_StripGatewayPrefix("/gateways")).toBe("/gateways"); // not the /gateway segment
    expect(_StripGatewayPrefix(undefined)).toBe("/");
  });
});

describe("_IsControlUiRequest", () =>
{
  it("matches the /control-ui segment and its descendants/query", () =>
  {
    expect(_IsControlUiRequest("/control-ui")).toBe(true);
    expect(_IsControlUiRequest("/control-ui/")).toBe(true);
    expect(_IsControlUiRequest("/control-ui/assets/index-a1.js")).toBe(true);
    expect(_IsControlUiRequest("/control-ui?x=1")).toBe(true);
  });

  it("does not match a sibling path, the WS route, or health probes", () =>
  {
    expect(_IsControlUiRequest("/control-uix")).toBe(false);
    expect(_IsControlUiRequest("/gateway")).toBe(false);
    expect(_IsControlUiRequest("/api")).toBe(false);
    expect(_IsControlUiRequest("/healthz")).toBe(false);
    expect(_IsControlUiRequest(undefined)).toBe(false);
  });
});

/** A fake HTTP proxy recording forward targets + injected options. */
function _fakeWebProxy(): WebProxy & { targets: string[]; options: Array<{ target: string; headers?: Record<string, string> }> }
{
  const targets: string[] = [];
  const options: Array<{ target: string; headers?: Record<string, string> }> = [];
  return {
    targets,
    options,
    web(_req, _res, opts) { targets.push(opts.target); options.push(opts as { target: string; headers?: Record<string, string> }); }
  };
}

/** A fake ServerResponse recording status + headersSent. */
function _fakeRes(): ServerResponse & { status: number | null; headersSent: boolean; ended: boolean }
{
  const res = {
    status: null as number | null,
    headersSent: false,
    ended: false,
    writeHead(status: number) { (res as { status: number | null }).status = status; (res as { headersSent: boolean }).headersSent = true; return res; },
    end() { (res as { ended: boolean }).ended = true; return res; }
  };
  return res as unknown as ServerResponse & { status: number | null; headersSent: boolean; ended: boolean };
}

describe("_HandleControlUiRequest (Control UI static bundle)", () =>
{
  function _controlUiDeps(resolve: ControlUiDeps["resolve"]): { deps: ControlUiDeps; proxy: ReturnType<typeof _fakeWebProxy> }
  {
    const proxy = _fakeWebProxy();
    return { deps: { config: baseConfig, proxy, log, resolve }, proxy };
  }

  function _httpReq(url: string, headers: Record<string, string | undefined> = {}): IncomingMessage
  {
    return { headers: { host: "acme.opencrane.ai", cookie: "sid=x", ...headers }, url, socket: { remoteAddress: "10.0.0.1" } } as unknown as IncomingMessage;
  }

  it("proxies to the caller's pod gateway over HTTP with NO identity/scope injection", async () =>
  {
    const resolve = vi.fn().mockResolvedValue(okTarget);
    const { deps, proxy } = _controlUiDeps(resolve);

    await _HandleControlUiRequest(deps, _httpReq("/control-ui/assets/index-a1.js"), _fakeRes());

    expect(proxy.targets).toEqual(["http://openclaw-alice.opencrane-acme.svc.cluster.local:18789"]);
    // Static bundle: no X-Forwarded-User / x-openclaw-scopes on the forward.
    expect(proxy.options[0]?.headers).toBeUndefined();
  });

  it("refuses with the control plane's status when resolution fails", async () =>
  {
    const { deps, proxy } = _controlUiDeps(vi.fn().mockResolvedValue({ ok: false, status: 403, reason: "no tenant" } as ResolveOutcome));
    const res = _fakeRes();

    await _HandleControlUiRequest(deps, _httpReq("/control-ui/"), res);

    expect(res.status).toBe(403);
    expect(proxy.targets).toEqual([]);
  });
});
