import { ConnectionStatus } from "@opencrane/state/core";

/**
 * Enum-first UI state for the conversation centre pane, derived from the live
 * gateway connection status. Keeps the template free of magic strings and the
 * status→view rule unit-testable without Angular DI.
 */
export enum ConversationViewState
{
	/**
	 * The normal transcript surface — header, message stream, and composer all
	 * render. Covers idle, connecting, open, and closed: a transient disconnect
	 * never hides the conversation.
	 */
	Active = "active",

	/**
	 * The control plane refused to broker a pod for this identity (HTTP 403/409
	 * from `POST /auth/pod-token`): no workspace is provisioned for the session
	 * email, or the email maps to more than one tenant. A terminal state — the
	 * pane shows a "no workspace" notice with no composer and no reconnect
	 * (MVP functional spec §4.5 / W3).
	 */
	NoWorkspace = "no-workspace",

	/**
	 * The caller's tenant resolved, but its OpenClaw pod is still being provisioned
	 * (HTTP 409 `POD_NOT_READY` from `POST /auth/pod-token`). A *transient* state,
	 * distinct from {@link NoWorkspace}: the workspace exists, so the pane shows a
	 * "setting up" notice with a retry — never "ask an administrator".
	 */
	Provisioning = "provisioning"
}

/**
 * Map the live {@link ConnectionStatus} onto the centre-pane
 * {@link ConversationViewState}.
 *
 * {@link ConnectionStatus.Refused} maps to the terminal "no workspace" notice and
 * {@link ConnectionStatus.Provisioning} to the transient "setting up" notice; every
 * other status (idle / connecting / open / closed) renders the normal transcript
 * surface, so a transient disconnect never collapses the pane. Pure + exported so
 * the rule is unit-tested directly.
 *
 * @param status - The gateway's current connection status.
 * @returns The view state the centre pane should render.
 */
export function _ToConversationViewState(status: ConnectionStatus): ConversationViewState
{
	if (status === ConnectionStatus.Refused)
	{
		return ConversationViewState.NoWorkspace;
	}
	if (status === ConnectionStatus.Provisioning)
	{
		return ConversationViewState.Provisioning;
	}
	return ConversationViewState.Active;
}
