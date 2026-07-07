import { createServer } from "node:http";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

import httpProxy from "http-proxy";
import type { Logger } from "pino";

import { _HandleControlUiRequest, _HandleUpgrade, _IsControlUiRequest, _RelaxControlUiFrameHeaders } from "./proxy.js";
import type { ControlUiDeps, GatewayProxyRuntime, WebProxy, WsProxy } from "./proxy.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";

/** Everything the in-operator proxy server needs, derived from the operator config. */
export interface GatewayProxyServerConfig extends GatewayProxyRuntime
{
  /** TCP port the proxy listens on (separate from the operator's other ports). */
  port: number;
  /** Max gateway sockets one identity may open per minute (per operator replica). */
  rateLimitPerMinute: number;
}

/**
 * The identity-routing gateway proxy, folded into the operator process (DOMAIN.T4).
 *
 * It runs its own HTTP server on a dedicated port: liveness/readiness probes on
 * `/healthz`/`/readyz`, and the gateway WebSocket upgrade routed through
 * {@link _HandleUpgrade}. It holds no Kubernetes client and no secrets — every auth +
 * routing decision is delegated to the control plane. Co-locating it in the operator
 * trades a separate Deployment for a shared process; it can be split back out into its
 * own pod later with no contract change (the upgrade handler is already self-contained).
 */
export class GatewayProxyServer
{
  private readonly config: GatewayProxyServerConfig;
  private readonly log: Logger;
  private server: Server | null = null;
  private proxy: httpProxy | null = null;

  /**
   * @param config - Proxy runtime settings derived from the operator config.
   * @param log    - Operator root logger; scoped to `gateway-proxy` inside.
   */
  constructor(config: GatewayProxyServerConfig, log: Logger)
  {
    this.config = config;
    this.log = log.child({ component: "gateway-proxy" });
  }

  /** Start the proxy HTTP server + WS upgrade handler. Idempotent-safe to call once. */
  start(): void
  {
    if (this.config.allowedOrigins.length === 0 && this.config.allowedOriginBaseDomains.length === 0)
    {
      this.log.warn("GATEWAY_PROXY_ALLOWED_ORIGINS and GATEWAY_PROXY_ALLOWED_ORIGIN_BASE_DOMAINS are both empty — every gateway WS upgrade will be refused (CSWSH fail-closed)");
    }

    const proxy = httpProxy.createProxyServer({ ws: true });
    proxy.on("error", (err) => this.log.error({ err }, "http-proxy emitted an error"));
    // Control UI responses: relax the gateway's frame-blocking headers (XFO DENY +
    // frame-ancestors 'none') to same-origin so the org SPA can iframe the chat surface.
    // Mutating proxyRes.headers here is the http-proxy seam — they are copied to the
    // client response after this event fires. Scoped to /control-ui requests only.
    proxy.on("proxyRes", (proxyRes, req) =>
    {
      if (_IsControlUiRequest(req.url)) _RelaxControlUiFrameHeaders(proxyRes.headers as Record<string, unknown>);
    });
    this.proxy = proxy;

    const limiter = new FixedWindowRateLimiter(this.config.rateLimitPerMinute);
    const deps = { config: this.config, proxy: proxy as unknown as WsProxy, limiter, log: this.log };
    const controlUiDeps: ControlUiDeps = { config: this.config, proxy: proxy as unknown as WebProxy, log: this.log };

    const server = createServer((req: IncomingMessage, res: ServerResponse) =>
    {
      if (req.url === "/healthz" || req.url === "/readyz")
      {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok");
        return;
      }
      // Serve the Control UI static bundle (so the org SPA can embed it) by proxying
      // to the caller's pod gateway; static assets, so no identity/scope injection.
      if (_IsControlUiRequest(req.url))
      {
        void _HandleControlUiRequest(controlUiDeps, req, res).catch((err: unknown) =>
        {
          this.log.error({ err }, "unhandled error in control-ui request handler");
          if (!res.headersSent)
          {
            res.writeHead(502, { "content-type": "text/plain" });
            res.end("Bad Gateway");
          }
        });
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    });

    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) =>
    {
      void _HandleUpgrade(deps, req, socket, head).catch((err: unknown) =>
      {
        this.log.error({ err }, "unhandled error in gateway upgrade handler");
        if (!socket.destroyed) socket.destroy();
      });
    });

    server.listen(this.config.port, () =>
      this.log.info({ port: this.config.port, allowedOrigins: this.config.allowedOrigins.length, baseDomains: this.config.allowedOriginBaseDomains.length, gatewayPort: this.config.gatewayPort }, "gateway-proxy listening (in-operator)"));

    this.server = server;
  }

  /** Drain the proxy server (called on operator shutdown). */
  async stop(): Promise<void>
  {
    const server = this.server;
    if (server)
    {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      this.server = null;
    }
    this.proxy?.close();
    this.proxy = null;
  }
}
