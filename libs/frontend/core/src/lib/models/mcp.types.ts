/**
 * Domain model for the MCP (Model Context Protocol) catalogue, credential
 * connect, and activation feature.
 *
 * WeOwnAI is a pure network client: these are local projections of the
 * OpenCrane opencrane-ui `/api/v1/mcp/...` contract shapes the catalogue UI
 * renders, never a re-export of OpenCrane source.
 */

/**
 * How a user connects their identity to an MCP server — drives the Connect UX.
 *
 * Mirrors the Obot server-type taxonomy in the OpenCrane spec.
 */
export enum McpServerType
{
	/** The user supplies their own credential (an API token). */
	SingleUser = "single-user",
	/** An admin pre-sets a shared key; the user is never prompted. */
	MultiUser = "multi-user",
	/** Browser OAuth consent flow against the provider. */
	RemoteOauth = "remote-oauth"
}

/**
 * Governance lifecycle state of a server in the admin catalogue.
 *
 * Only `Published` (and entitled) servers are visible to regular users.
 * `Disabled` is the single terminal "off" state; a rejected server returns to
 * the admin's draft set rather than carrying a distinct terminal status.
 */
export enum McpApprovalStatus
{
	/** Awaiting admin review; not visible to users. */
	PendingReview = "pending-review",
	/** Reviewed and approved, but not yet user-visible. */
	Approved = "approved",
	/** Published — installable by entitled users. */
	Published = "published",
	/** Turned off after publication; hidden from users. */
	Disabled = "disabled"
}

/**
 * Per-user connection state of a server the user has installed.
 *
 * Activation in the user's agent runtime ("Claw") is automatic once connected;
 * `Activating` and `ActivationFailed` surface that backend step.
 */
export enum McpConnectionStatus
{
	/** Installed but the user still owes a credential. */
	NeedsCredential = "needs-credential",
	/** Connected; activating in the agent runtime. */
	Activating = "activating",
	/** Connected via a stored credential and active. */
	Connected = "connected",
	/** Connected via OAuth and active. */
	OauthConnected = "oauth-connected",
	/** Active through an admin-managed shared key (no user action). */
	SharedKey = "shared-key",
	/** Activation in the agent runtime failed; retryable. */
	ActivationFailed = "activation-failed"
}

/**
 * One configurable credential field from a server's config schema.
 *
 * For single-user servers, the Connect form is rendered from these fields.
 * A `sensitive` field is write-only: it is masked, never returned to the
 * browser, and never echoed back after being saved.
 */
export interface McpCredentialField
{
	/** Stable key sent to the control plane. */
	key: string;
	/** Human-readable field label. */
	label: string;
	/** Whether the field is mandatory. */
	required: boolean;
	/** Whether the value is a secret (write-only, masked, never read back). */
	sensitive: boolean;
	/** Placeholder shown in the empty input. */
	placeholder?: string;
	/** Optional hint rendered under the field. */
	hint?: string;
}

/**
 * A server entry in the MCP catalogue.
 */
export interface McpServer
{
	/** Stable id / slug (rendered in mono). */
	id: string;
	/** Display/technical name. */
	name: string;
	/** Short, one-line description. */
	description: string;
	/** Publisher / vendor label. */
	publisher: string;
	/** Two-letter glyph for the catalogue tile. */
	glyph: string;
	/** Connection type — drives the Connect UX. */
	type: McpServerType;
	/** Governance lifecycle status. */
	approvalStatus: McpApprovalStatus;
	/** Credential fields for single-user servers (empty for multi-user / OAuth). */
	credentialSchema: McpCredentialField[];
	/** Short entitlement summary for the admin table (e.g. "Everyone (org)"). */
	entitlementSummary: string;
}

/**
 * A server the current user has installed, with live per-user connection state.
 *
 * Joined to its {@link McpServer} by {@link serverId} in the view layer.
 */
export interface McpInstalledServer
{
	/** The catalogue server id this record belongs to. */
	serverId: string;
	/** Per-user connection status. */
	connectionStatus: McpConnectionStatus;
	/** Relative last-used label, or null when never used. */
	lastUsed: string | null;
	/** Connected account label for OAuth servers (e.g. an email), when known. */
	connectedAccount?: string;
}

/** Visual style for a server type chip. */
export interface McpChipStyle
{
	/** Chip label. */
	label: string;
	/** Accent colour (hex). */
	color: string;
}

/**
 * Server-type chip style, reusing the scope-colour palette so the connection
 * mechanism is legible at a glance.
 */
export const MCP_TYPE_STYLES: Record<McpServerType, McpChipStyle> =
{
	[McpServerType.SingleUser]: { label: "single-user", color: "#C84B31" },
	[McpServerType.MultiUser]: { label: "multi-user", color: "#7A6AA0" },
	[McpServerType.RemoteOauth]: { label: "remote-oauth", color: "#4A6B8A" }
};

/**
 * Approval-status chip style, mapping each lifecycle state onto a status colour.
 */
export const MCP_APPROVAL_STYLES: Record<McpApprovalStatus, McpChipStyle> =
{
	[McpApprovalStatus.PendingReview]: { label: "pending review", color: "#A0855A" },
	[McpApprovalStatus.Approved]: { label: "approved", color: "#4A6B8A" },
	[McpApprovalStatus.Published]: { label: "published", color: "#5A8A5A" },
	[McpApprovalStatus.Disabled]: { label: "disabled", color: "#7A766D" }
};

/** Visual style for a connection-status indicator. */
export interface McpConnectionStyle
{
	/** Status label. */
	label: string;
	/** Indicator colour (hex). */
	color: string;
	/** Whether the dot should pulse (in-progress states). */
	pulse: boolean;
}

/**
 * Connection-status indicator style. `NeedsCredential` is the one state tinted
 * with the terracotta accent, since it is the only one carrying a user CTA.
 */
export const MCP_CONNECTION_STYLES: Record<McpConnectionStatus, McpConnectionStyle> =
{
	[McpConnectionStatus.NeedsCredential]: { label: "Needs credential", color: "#C84B31", pulse: false },
	[McpConnectionStatus.Activating]: { label: "Activating…", color: "#7A766D", pulse: true },
	[McpConnectionStatus.Connected]: { label: "Connected", color: "#5A8A5A", pulse: false },
	[McpConnectionStatus.OauthConnected]: { label: "OAuth connected", color: "#5A8A5A", pulse: false },
	[McpConnectionStatus.SharedKey]: { label: "Shared key · set by admin", color: "#4A6B8A", pulse: false },
	[McpConnectionStatus.ActivationFailed]: { label: "Activation failed", color: "#C84B31", pulse: false }
};

/** A user that can be granted access to a server (entitlement target). */
export interface McpEntitledUser
{
	/** Stable user id. */
	id: string;
	/** Display name. */
	name: string;
	/** Two-letter avatar initials. */
	initials: string;
	/** Avatar background colour (hex). */
	color: string;
}

/**
 * Access policy for one server — who may install it. Mirrors the control
 * plane's AccessPolicy: an org-wide grant plus explicit group and user grants
 * (additive when {@link everyoneInOrg} is on).
 */
export interface McpAccessPolicy
{
	/** The server this policy governs. */
	serverId: string;
	/** Whether every current and future org member is entitled. */
	everyoneInOrg: boolean;
	/** Entitled group names. */
	groups: string[];
	/** Entitled individual users. */
	users: McpEntitledUser[];
}

/** Candidate users + groups an admin can add to a policy. */
export interface McpDirectory
{
	/** All assignable users. */
	users: McpEntitledUser[];
	/** All assignable group names. */
	groups: string[];
}
