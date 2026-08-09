import { InjectionToken } from "@angular/core";

/** User-facing lifecycle for a pending approval card. */
export enum ApprovalDecisionStates
{
	/** The approval is still actionable by the signed-in owner. */
	Pending = "pending",
	/** The approve request is in flight. */
	Approving = "approving",
	/** The deny request is in flight. */
	Denying = "denying",
	/** The server recorded an approval decision. */
	Approved = "approved",
	/** The server recorded a denial decision. */
	Denied = "denied",
	/** The approval can no longer be decided. */
	Stale = "stale",
	/** The approval expired before the owner decided it. */
	Expired = "expired",
	/** The decision attempt failed but can be retried. */
	Failed = "failed"
}

/** Terminal decisions accepted by the OpenCrane approval endpoint. */
export enum ApprovalDecisions
{
	/** Allow the exact server-owned action to continue. */
	Approve = "approved",
	/** Reject the exact server-owned action. */
	Deny = "denied"
}

/** Browser-safe failure categories for approval decisions. */
export enum ApprovalDecisionFailures
{
	/** The request body or approval id was invalid. */
	InvalidRequest = "invalid_request",
	/** The browser session is missing or expired. */
	AuthenticationRequired = "authentication_required",
	/** The signed-in owner cannot decide this approval. */
	NotAuthorized = "not_authorized",
	/** The approval is absent, terminal, expired, or no longer visible. */
	StaleDecision = "stale_decision",
	/** The approval expired before the decision. */
	Expired = "expired",
	/** The server could not persist the decision right now. */
	Unavailable = "unavailable",
	/** The generated client returned an unexpected failure. */
	Unknown = "unknown"
}

/** Display-safe approval card data returned for the signed-in owner. */
export interface ApprovalCardView
{
	/** Opaque approval identifier used only for the decision route. */
	readonly approvalId: string;
	/** Opaque run identifier associated with the pending approval. */
	readonly runId: string;
	/** Human-readable title derived from redacted contract fields. */
	readonly title: string;
	/** Human-readable detail derived from redacted contract fields. */
	readonly description: string;
	/** Display-safe tool label. */
	readonly toolName: string;
	/** ISO-8601 timestamp for when the approval was requested. */
	readonly requestedAt: string;
	/** ISO-8601 timestamp for when the approval expires. */
	readonly expiresAt: string;
	/** Current browser-visible card state. */
	readonly status: ApprovalDecisionStates;
	/** Attempt number reported by the product authority. */
	readonly attempt: number;
}

/** Input for one terminal approval decision. */
export interface ApprovalDecisionRequest
{
	/** Opaque approval identifier from the pending approval list. */
	readonly approvalId: string;
	/** Terminal decision to record. */
	readonly decision: ApprovalDecisions;
}

/** Result of one approval decision request. */
export interface ApprovalDecisionResult
{
	/** Opaque approval identifier returned by the server. */
	readonly approvalId: string;
	/** Browser-visible state after the decision attempt. */
	readonly state: ApprovalDecisionStates;
	/** User-safe failure category when the decision failed. */
	readonly failure?: ApprovalDecisionFailures;
	/** Whether the same approval decision can be retried. */
	readonly retryable: boolean;
}

/** State gateway for signed-in owner approval decisions. */
export interface ApprovalDecisionGateway
{
	/** List display-safe pending approvals for the signed-in owner. */
	listPending(): Promise<readonly ApprovalCardView[]>;

	/**
	 * Decide one pending approval.
	 *
	 * @param request - Approval id and terminal decision only.
	 * @returns Browser-safe decision result.
	 */
	decide(request: ApprovalDecisionRequest): Promise<ApprovalDecisionResult>;
}

/** DI token for the active approval-decision gateway. */
export const APPROVAL_DECISION_GATEWAY: InjectionToken<ApprovalDecisionGateway> = new InjectionToken<ApprovalDecisionGateway>("OPENCRANE_APPROVAL_DECISION_GATEWAY");
