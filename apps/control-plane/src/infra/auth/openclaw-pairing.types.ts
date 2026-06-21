/**
 * Resolved OpenClaw connection coordinates for a tenant pod.
 *
 * Under trusted-proxy gateway auth (CONN.4) the browser holds no credential —
 * the gateway socket is authorised at the ingress against the live OIDC session
 * (`/auth/gateway-verify`), so only the gateway URL is needed to connect.
 */
export interface OpenClawPairing
{
  /** Gateway WebSocket URL (`wss://…`) the browser connects to. */
  gatewayUrl: string;
}
