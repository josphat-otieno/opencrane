/**
 * Selects which backing implementation every swappable data gateway is bound
 * to for a given app build.
 *
 * - "mock" — in-memory fixtures (default in development and in unit tests).
 * - "live" — the OpenCrane / network-backed gateways (default in production).
 *
 * One flag drives the whole cutover: the per-app environment file sets this,
 * and the provider helpers in this lib translate it into the concrete DI
 * bindings, so mock-to-live is a single switch rather than scattered edits
 * across both app configs.
 */
export type GatewayMode = "mock" | "live";

import { InjectionToken } from "@angular/core";

/**
 * DI token exposing the active {@link GatewayMode} so UI components can
 * suppress fixture/demo data in live mode without coupling to any specific
 * gateway implementation.
 */
export const GATEWAY_MODE = new InjectionToken<GatewayMode>("WO_GATEWAY_MODE");

/**
 * Optional per-gateway overrides for the operator app, layered on top of
 * {@link GatewayMode}.
 *
 * Lets a build opt the conversation gateway into its live implementation
 * independently of the data gateways, so the OpenClaw pod cutover (plan.md W3)
 * becomes a one-flag config choice rather than a code edit in the provider.
 */
export interface OperatorGatewayOptions
{
	/**
	 * Bind the live `OpenClawConversationGateway` when {@link GatewayMode} is
	 * `"live"`. Defaults to `false`: the conversation gateway stays on the mock
	 * even in live mode until a reachable, paired pod exists (plan.md W2 / Track
	 * GW B4).
	 */
	liveConversation?: boolean;
}
