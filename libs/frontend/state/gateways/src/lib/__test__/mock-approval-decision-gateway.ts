import { ApprovalDecisionStates, ApprovalDecisions } from "@opencrane/state/approvals/adapter";
import type { ApprovalCardView, ApprovalDecisionGateway, ApprovalDecisionRequest, ApprovalDecisionResult } from "@opencrane/state/approvals/adapter";

/** In-memory approval gateway for feature and gateway-provider tests. */
export class MockApprovalDecisionGateway implements ApprovalDecisionGateway
{
	/** Pending approvals returned by the fake list endpoint. */
	public approvals: ApprovalCardView[] = [];

	/** Decision requests observed by this fake gateway. */
	public readonly decisions: ApprovalDecisionRequest[] = [];

	/** Result returned by the next decision call. */
	public result: ApprovalDecisionResult | null = null;

	/** @inheritdoc */
	public async listPending(): Promise<readonly ApprovalCardView[]>
	{
		return this.approvals.map(function _copy(approval: ApprovalCardView): ApprovalCardView { return { ...approval }; });
	}

	/** @inheritdoc */
	public async decide(request: ApprovalDecisionRequest): Promise<ApprovalDecisionResult>
	{
		this.decisions.push(request);
		if (this.result !== null) return this.result;
		return { approvalId: request.approvalId, state: request.decision === ApprovalDecisions.Approve ? ApprovalDecisionStates.Approved : ApprovalDecisionStates.Denied, retryable: false };
	}
}
