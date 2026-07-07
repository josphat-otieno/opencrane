import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

import type { Logger } from "pino";

import { _OriginAllowed } from "./origin.js";
import type { FixedWindowRateLimiter } from "./rate-limit.js";
import { _ResolveTarget } from "./auth-client.js";
import type { ResolveOutcome } from "./auth-client.js";

/** The proxy runtime settings the handler needs (a subset of the operator config). */
export interface GatewayProxyRuntime
{
  /** Internal control-plane base URL the delegated-auth call targets. */
  controlPlaneUrl: string;
  /** The OpenClaw pod gateway port the proxy forwards to (cluster-internal). */
  gatewayPort: number;
  /** In-cluster DNS suffix for the pod Service FQDN (e.g. `svc.cluster.local`). */
  clusterDomain: string;
  /** Header the verified identity is injected into for the pod's trusted-proxy auth. */
  userHeader: string;
  /** Exact `Origin` values allowed (CSWSH), for vanity hosts. */
  allowedOrigins: string[];
  /** Platform base domains; any `https://<org>.<base>` host is allowed (CSWSH). */
  allowedOriginBaseDomains: string[];
}

/** Minimal WS reverse-proxy surface the handler needs (satisfied by `http-proxy`). */
export interface WsProxy
{
  ws(req: IncomingMessage, socket: Duplex, head: Buffer, options: { target: string; headers?: Record<string, string> }, callback: (err: Error) => void): void;
}

/** Minimal HTTP reverse-proxy surface for serving the Control UI (satisfied by `http-proxy`). */
export interface WebProxy
{
  web(req: IncomingMessage, res: ServerResponse, options: { target: string }, callback: (err: Error) => void): void;
}

/** Delegated-auth resolver signature; defaults to the live control-plane call. */
type ResolveFn = (controlPlaneUrl: string, cookie: string | undefined, host: string | undefined, signal: AbortSignal) => Promise<ResolveOutcome>;

/** Dependencies for {@link _HandleUpgrade}; injectable so the handler is unit-testable. */
export interface UpgradeDeps
{
  config: GatewayProxyRuntime;
  proxy: WsProxy;
  limiter: FixedWindowRateLimiter;
  log: Logger;
  /** Delegated-auth resolver; defaults to the live control-plane call. */
  resolve?: ResolveFn;
}

/** Dependencies for {@link _HandleControlUiRequest}; injectable so the handler is unit-testable. */
export interface ControlUiDeps
{
  config: GatewayProxyRuntime;
  proxy: WebProxy;
  log: Logger;
  /** Delegated-auth resolver; defaults to the live control-plane call. */
  resolve?: ResolveFn;
}

/** Bound on the delegated-auth call so a slow control plane can't pin a socket open. */
const _RESOLVE_TIMEOUT_MS = 5_000;

/**
 * External path prefix the gateway WebSocket is exposed under on the org host.
 *
 * Same-origin hosting (DOMAIN.T4) puts the org-admin SPA at `/` and the control plane
 * at `/api`, so the gateway WS cannot also own `/` — it is routed at `/gateway`. The
 * OpenClaw pod's gateway listens at `/`, so the proxy strips this prefix before
 * forwarding (see {@link _StripGatewayPrefix}). No ingress `rewrite-target` is needed,
 * and a legacy client connecting at `/` still works (the prefix is only stripped when
 * present), so the change is backward-compatible.
 */
const _GATEWAY_PATH_PREFIX = "/gateway";

/** Header the gateway reads to CAP a Control-UI session's scopes (intersection, not a grant). */
const _SCOPES_HEADER = "x-openclaw-scopes";

/**
 * Scopes the proxy caps every gateway WS session to (chat-only).
 *
 * OpenClaw intersects the session's requested scopes with `x-openclaw-scopes` when the
 * proxy sends it (see docs/gateway/trusted-proxy-auth). Capping to `operator.read` +
 * `operator.write` grants exactly what chat needs (read history + send) while denying
 * `operator.admin` — so the Control UI's config/nodes/admin surfaces are refused at the
 * gateway, not merely hidden. The proxy is the trust boundary, so a client cannot widen
 * this by self-declaring the header (we strip any inbound copy before injecting ours).
 *
 * COMMA-separated: openclaw's `resolveTrustedProxyControlUiScopes` parses this header
 * with `split(",")` (verified against openclaw@2026.6.9 dist). A space-separated value
 * reads as ONE unknown scope, the intersection goes empty, and the session gets NO
 * scopes ("this connection is missing operator.read").
 */
const _CHAT_SCOPES = "operator.read,operator.write";

/**
 * Strip a leading `/gateway` segment from the upgrade request path so the upstream
 * OpenClaw pod (whose gateway listens at `/`) sees the path it expects, regardless of
 * the external routing prefix. Only strips when the prefix is actually present, so a
 * bare `/` upgrade is forwarded unchanged.
 *
 * @param url - The raw upgrade request URL (path + optional query).
 * @returns The path with any leading `/gateway` segment removed.
 */
export function _StripGatewayPrefix(url: string | undefined): string
{
  const u = typeof url === "string" && url.length > 0 ? url : "/";
  if (u === _GATEWAY_PATH_PREFIX)
  {
    return "/";
  }
  if (u.startsWith(`${_GATEWAY_PATH_PREFIX}/`) || u.startsWith(`${_GATEWAY_PATH_PREFIX}?`))
  {
    const rest = u.slice(_GATEWAY_PATH_PREFIX.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return u;
}

/**
 * Authorise and route a single gateway WebSocket upgrade — the proxy's only job, now
 * folded into the operator process.
 *
 * Order is deliberate, cheapest-and-strictest first:
 *   1. **Origin allowlist** (CSWSH) — refuse before spending a control-plane call.
 *   2. **Delegated auth** — the control plane decides identity + forward target; the
 *      proxy holds NO session logic (it only replays the cookie).
 *   3. **Per-identity rate limit** — abuse backstop, keyed on the resolved email.
 *   4. **Inject + forward** — strip any client `X-Forwarded-User`, set it from the
 *      control-plane resolution, and reverse-proxy to `openclaw-<user>.<ns>.svc:<port>`.
 *
 * Every refusal closes the socket with a status line and is logged. Cross-tenant safety
 * rests on the control plane's `gateway-resolve` (routing) plus per-pod owner pinning.
 *
 * @param deps   - Injected config, proxy, limiter, logger, and (optionally) resolver.
 * @param req    - The HTTP upgrade request.
 * @param socket - The raw client socket.
 * @param head   - The first packet of the upgraded stream.
 */
export async function _HandleUpgrade(deps: UpgradeDeps, req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void>
{
  const { config, proxy, limiter, log } = deps;
  const resolve = deps.resolve ?? _ResolveTarget;
  const reqLog = log.child({ component: "gateway-proxy", remoteAddress: req.socket.remoteAddress, url: req.url });

  // 1. CSWSH guard — fail closed on a missing or non-allowlisted Origin.
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (!_OriginAllowed(origin, config.allowedOrigins, config.allowedOriginBaseDomains))
  {
    reqLog.warn({ origin }, "gateway upgrade refused: origin not allowlisted");
    _refuse(socket, 403);
    return;
  }

  // 2. Delegated auth — the control plane is the sole authority. Forward the org host the
  //    upgrade arrived on (x-forwarded-host from the ingress, else Host) so the control plane
  //    scopes the email→tenant resolution to this silo; the internal call's own host is
  //    `opencrane-control-plane`, which would otherwise resolve nothing for a multi-silo owner.
  const forwardedHost = typeof req.headers["x-forwarded-host"] === "string" ? req.headers["x-forwarded-host"].split(",")[0].trim() : undefined;
  const host = forwardedHost ?? (typeof req.headers.host === "string" ? req.headers.host : undefined);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), _RESOLVE_TIMEOUT_MS);
  let outcome: ResolveOutcome;
  try
  {
    outcome = await resolve(config.controlPlaneUrl, req.headers.cookie, host, ac.signal);
  }
  finally
  {
    clearTimeout(timer);
  }

  if (!outcome.ok)
  {
    reqLog.warn({ status: outcome.status, reason: outcome.reason }, "gateway upgrade refused by control plane");
    _refuse(socket, outcome.status);
    return;
  }

  const { user, tenant, podService } = outcome.target;

  // 3. Per-identity rate limit — bound how many sockets one identity opens.
  if (!limiter.allow(user.email))
  {
    reqLog.warn({ email: user.email, tenant: tenant.name }, "gateway upgrade refused: rate limited");
    _refuse(socket, 429);
    return;
  }

  // 4. Strip any client-supplied identity/scope headers, inject the verified identity
  //    and the chat-only scope cap, forward.
  delete req.headers[config.userHeader.toLowerCase()];
  delete req.headers[_SCOPES_HEADER];
  // The gateway WS is exposed at `/gateway` on the org host (the SPA owns `/`); the pod
  // gateway listens at `/`, so drop the prefix before forwarding. Backward-compatible: a
  // bare `/` upgrade is left untouched.
  req.url = _StripGatewayPrefix(req.url);
  const target = `ws://${podService.name}.${podService.namespace}.${config.clusterDomain}:${config.gatewayPort}`;
  reqLog.info({ email: user.email, tenant: tenant.name, target }, "gateway upgrade authorised; proxying");
  proxy.ws(req, socket, head, { target, headers: { [config.userHeader]: user.email, [_SCOPES_HEADER]: _CHAT_SCOPES } }, function _onProxyError(err: Error)
  {
    reqLog.error({ err, target }, "gateway proxy transport error");
    if (!socket.destroyed)
    {
      socket.destroy();
    }
  });
}

/** External path prefix the Control UI static bundle is served under on the org host. */
const _CONTROL_UI_PATH_PREFIX = "/control-ui";

/**
 * Whether an HTTP request targets the Control UI static bundle (`/control-ui/…`).
 *
 * Exact prefix match on the `/control-ui` segment so a sibling path (`/control-uix`)
 * is not captured; the gateway serves the bundle under this same base path, so the
 * URL is forwarded unchanged (no prefix strip, unlike the `/gateway` WS route).
 *
 * @param url - The raw request URL (path + optional query).
 * @returns True when the request should be served by {@link _HandleControlUiRequest}.
 */
export function _IsControlUiRequest(url: string | undefined): boolean
{
  const u = url ?? "";
  return u === _CONTROL_UI_PATH_PREFIX || u.startsWith(`${_CONTROL_UI_PATH_PREFIX}/`) || u.startsWith(`${_CONTROL_UI_PATH_PREFIX}?`);
}

/**
 * Relax the gateway's frame-blocking headers on Control UI responses so the org-admin
 * SPA can embed the chat surface in a SAME-ORIGIN iframe.
 *
 * OpenClaw serves the Control UI with `X-Frame-Options: DENY` and a CSP containing
 * `frame-ancestors 'none'` (verified against openclaw@2026.6.9), which blocks ALL
 * framing — including our own same-origin embed. The proxy rewrites these to the
 * same-origin equivalents: drop `X-Frame-Options` (superseded by CSP frame-ancestors
 * in every modern browser) and rewrite `frame-ancestors 'none'` → `'self'`, so ONLY
 * the org host itself may frame it — clickjacking protection is preserved, third-party
 * framing stays refused. Every other CSP directive is left untouched.
 *
 * @param headers - The upstream response headers, mutated in place.
 */
export function _RelaxControlUiFrameHeaders(headers: Record<string, unknown>): void
{
  delete headers["x-frame-options"];
  const csp = headers["content-security-policy"];
  if (typeof csp === "string")
  {
    headers["content-security-policy"] = csp.replace(/frame-ancestors 'none'/g, "frame-ancestors 'self'");
  }
}

/**
 * Serve OpenClaw's Control UI static bundle by reverse-proxying `/control-ui/…` to the
 * caller's own pod gateway (which serves the bundle under the same base path).
 *
 * Unlike the WS upgrade this injects NO identity/scope headers: the bundle is static
 * and the gateway serves it without auth (auth happens on the WS the loaded app opens
 * at `/gateway`). We still resolve the caller→pod via the control plane, so a request
 * is only ever forwarded to that user's silo pod; and the whole org host already sits
 * behind the ingress OIDC gate, so an unauthenticated request never reaches here.
 *
 * The path is forwarded unchanged (the gateway's `controlUi.basePath` is `/control-ui`).
 * NOTE: the caller→pod resolution runs per request; the Control UI's service worker +
 * browser cache mean this is essentially a first-load cost. A cookie→pod cache is a
 * cheap future optimisation if that proves hot.
 *
 * @param deps - Injected config, HTTP proxy, logger, and (optionally) resolver.
 * @param req  - The HTTP request.
 * @param res  - The HTTP response.
 */
export async function _HandleControlUiRequest(deps: ControlUiDeps, req: IncomingMessage, res: ServerResponse): Promise<void>
{
  const { config, proxy, log } = deps;
  const resolve = deps.resolve ?? _ResolveTarget;
  const reqLog = log.child({ component: "gateway-proxy", url: req.url });

  const forwardedHost = typeof req.headers["x-forwarded-host"] === "string" ? req.headers["x-forwarded-host"].split(",")[0].trim() : undefined;
  const host = forwardedHost ?? (typeof req.headers.host === "string" ? req.headers.host : undefined);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), _RESOLVE_TIMEOUT_MS);
  let outcome: ResolveOutcome;
  try
  {
    outcome = await resolve(config.controlPlaneUrl, req.headers.cookie, host, ac.signal);
  }
  finally
  {
    clearTimeout(timer);
  }

  if (!outcome.ok)
  {
    reqLog.warn({ status: outcome.status, reason: outcome.reason }, "control-ui request refused by control plane");
    res.writeHead(outcome.status, { "content-type": "text/plain" });
    res.end(_REASONS[outcome.status] ?? "Bad Gateway");
    return;
  }

  const { podService } = outcome.target;
  const target = `http://${podService.name}.${podService.namespace}.${config.clusterDomain}:${config.gatewayPort}`;
  reqLog.info({ tenant: outcome.target.tenant.name, target }, "control-ui request authorised; proxying");
  proxy.web(req, res, { target }, function _onProxyError(err: Error)
  {
    reqLog.error({ err, target }, "control-ui proxy transport error");
    if (!res.headersSent)
    {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("Bad Gateway");
    }
    else if (!res.writableEnded)
    {
      res.end();
    }
  });
}

/** Standard reason phrases for the statuses the proxy emits on refusal. */
const _REASONS: Record<number, string> = {
  401: "Unauthorized",
  403: "Forbidden",
  429: "Too Many Requests",
  502: "Bad Gateway",
};

/**
 * Refuse an upgrade by writing a bare HTTP response and closing the socket.
 *
 * @param socket - The raw client socket to close.
 * @param status - The HTTP status to report before closing.
 */
function _refuse(socket: Duplex, status: number): void
{
  const reason = _REASONS[status] ?? "Bad Gateway";
  try
  {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  catch
  {
    // Socket may already be gone; the destroy below is the real cleanup.
  }
  socket.destroy();
}
