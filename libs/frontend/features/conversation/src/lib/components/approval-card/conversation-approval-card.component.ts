import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";

import { ApprovalDecisionStates, type ApprovalCardView } from "@opencrane/state/approvals/adapter";

/** Feature-local card for one server-owned tool approval decision. */
@Component({
	selector: "wo-conversation-approval-card",
	standalone: true,
	templateUrl: "./conversation-approval-card.component.html",
	styleUrl: "./conversation-approval-card.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationApprovalCardComponent
{
	/** Display-safe approval supplied by the route feature. */
	public readonly approval = input.required<ApprovalCardView>();

	/** Emits when the owner approves this exact server-owned action. */
	public readonly approveRequested = output<string>();

	/** Emits when the owner denies this exact server-owned action. */
	public readonly denyRequested = output<string>();

	/** Emits when the owner retries the last failed decision. */
	public readonly retryRequested = output<string>();

	/** State enum exposed to the template. */
	public readonly states = ApprovalDecisionStates;

	/** Whether either decision action is currently in flight. */
	public readonly deciding = computed(this._deciding.bind(this));

	/** Whether the approval can still be decided from this card. */
	public readonly actionable = computed(this._actionable.bind(this));

	/** User-facing status copy for the card. */
	public readonly statusLabel = computed(this._statusLabel.bind(this));

	/** Accessible role for the latest decision state. */
	public readonly role = computed(this._role.bind(this));

	/** Ask the parent route to approve this approval. */
	public approve(): void
	{
		if (!this.actionable()) return;
		this.approveRequested.emit(this.approval().approvalId);
	}

	/** Ask the parent route to deny this approval. */
	public deny(): void
	{
		if (!this.actionable()) return;
		this.denyRequested.emit(this.approval().approvalId);
	}

	/** Ask the parent route to retry the last failed decision. */
	public retry(): void
	{
		if (this.approval().status !== ApprovalDecisionStates.Failed) return;
		this.retryRequested.emit(this.approval().approvalId);
	}

	/** Detect unresolved decision calls. */
	private _deciding(): boolean
	{
		const status = this.approval().status;
		return status === ApprovalDecisionStates.Approving || status === ApprovalDecisionStates.Denying;
	}

	/** Allow pending or retryable failed cards to be decided. */
	private _actionable(): boolean
	{
		const status = this.approval().status;
		return status === ApprovalDecisionStates.Pending;
	}

	/** Convert decision state into concise copy. */
	private _statusLabel(): string
	{
		const status = this.approval().status;
		return _APPROVAL_STATUS_LABELS[status];
	}

	/** Announce decision failures assertively while keeping normal status quiet. */
	private _role(): "status" | "alert"
	{
		return this.approval().status === ApprovalDecisionStates.Failed ? "alert" : "status";
	}
}

/** Exhaustive label mapping for approval decision card states. */
const _APPROVAL_STATUS_LABELS: Record<ApprovalDecisionStates, string> = {
	[ApprovalDecisionStates.Pending]: "Pending",
	[ApprovalDecisionStates.Approving]: "Approving",
	[ApprovalDecisionStates.Denying]: "Denying",
	[ApprovalDecisionStates.Approved]: "Approved",
	[ApprovalDecisionStates.Denied]: "Denied",
	[ApprovalDecisionStates.Stale]: "No longer available",
	[ApprovalDecisionStates.Expired]: "Expired",
	[ApprovalDecisionStates.Failed]: "Decision failed"
};
