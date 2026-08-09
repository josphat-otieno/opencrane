import type { ApprovalDecisionGateway } from "@opencrane/state/approvals/adapter";

/** Callback invoked after an approval decision attempt updates local card state. */
export interface ConversationApprovalDecisionRecorded
{
	/** Ask the route to refresh server-owned replay and history state. */
	(): void;
}

/** Construction options for the feature-local approval controller. */
export interface ConversationApprovalControllerOptions
{
	/** Gateway that reads display-safe approvals and records terminal decisions. */
	readonly gateway: ApprovalDecisionGateway;

	/** Callback fired after a decision attempt so the route can refresh server-owned progress. */
	readonly onDecisionRecorded: ConversationApprovalDecisionRecorded;
}
