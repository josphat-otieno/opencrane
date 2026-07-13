import { GatewayMode } from "@opencrane/state/gateways";

/**
 * Production environment for the operator app.
 *
 * Data gateways bind to their live (OpenCrane-backed) implementations, except
 * the per-token exceptions documented in `provideControlPlaneGateways`.
 */
export const environment: { gatewayMode: GatewayMode; liveConversation?: boolean } =
{
	/** Bind every swappable gateway to its live implementation where one exists. */
	gatewayMode: "live",
	/** Enable the live OpenClaw conversation gateway (W3a). */
	liveConversation: true
};
