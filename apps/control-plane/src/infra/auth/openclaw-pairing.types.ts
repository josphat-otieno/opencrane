/**
 * Resolved OpenClaw pairing details for a tenant pod, derived from the pod's
 * pairing link (`{ url, bootstrapToken }`).
 */
export interface OpenClawPairing
{
  /** Gateway WebSocket URL (`wss://…`) the browser connects to. */
  gatewayUrl: string;

  /**
   * One-time bootstrap token for first pairing, or null once a device has been
   * paired (the client then reconnects with its persisted device token).
   */
  bootstrapToken: string | null;
}
