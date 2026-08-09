import { signal } from "@angular/core";
import type { WritableSignal } from "@angular/core";

import { ApprovalDecisionStates, ApprovalDecisions } from "@opencrane/state/approvals/adapter";
import type { ApprovalCardView, ApprovalDecisionGateway, ApprovalDecisionResult } from "@opencrane/state/approvals/adapter";
import { ConversationProgressStates } from "@opencrane/state/conversation/adapter";
import type { ConversationProgressSnapshot } from "@opencrane/state/conversation/adapter";

import type { ConversationApprovalControllerOptions, ConversationApprovalDecisionRecorded } from "./conversation-approval-controller.types.js";

/** Feature-local state owner for server-owned tool approval cards. */
export class ConversationApprovalController
{
	/** Gateway used to cross the session-bound approval API boundary. */
	private readonly _gateway: ApprovalDecisionGateway;

	/** Route callback used to refresh replay/progress after decision attempts. */
	private readonly _onDecisionRecorded: ConversationApprovalDecisionRecorded;

	/** Current display-safe approvals for the selected run. */
	public readonly cards: WritableSignal<readonly ApprovalCardView[]> = signal([]);

	/** Whether approval list loading is unresolved. */
	public readonly loading: WritableSignal<boolean> = signal(false);

	/** User-visible approval list failure. */
	public readonly error: WritableSignal<string | null> = signal(null);

	/** Last loaded run id for approval cards. */
	private _runId: string | null = null;

	/** Generation used to ignore stale approval-list reads. */
	private _loadGeneration = 0;

	/** Last attempted decision per approval, used by Retry. */
	private readonly _retryDecisions = new Map<string, ApprovalDecisions>();

	public constructor(options: ConversationApprovalControllerOptions)
	{
		this._gateway = options.gateway;
		this._onDecisionRecorded = options.onDecisionRecorded;
	}

	/** Load pending approvals only while the current run is waiting for the owner. */
	public syncForProgress(snapshot: ConversationProgressSnapshot): void
	{
		if (snapshot.state === ConversationProgressStates.Refreshing || snapshot.state === ConversationProgressStates.Reconnecting) return;
		if (snapshot.state !== ConversationProgressStates.WaitingForApproval || snapshot.runId === null)
		{
			this.clear();
			return;
		}
		if (this._runId === snapshot.runId) return;
		void this._load(snapshot.runId);
	}

	/** Retry the pending approval list for the current run. */
	public retryLoad(runId: string | null): void
	{
		if (runId === null) return;
		void this._load(runId);
	}

	/** Approve one exact server-owned action. */
	public approve(approvalId: string): void
	{
		void this._decide(approvalId, ApprovalDecisions.Approve);
	}

	/** Deny one exact server-owned action. */
	public deny(approvalId: string): void
	{
		void this._decide(approvalId, ApprovalDecisions.Deny);
	}

	/** Retry the last failed decision for one approval. */
	public retryDecision(approvalId: string): void
	{
		const decision = this._retryDecisions.get(approvalId);
		if (decision === undefined) return;
		void this._decide(approvalId, decision);
	}

	/** Clear approval state after route/run state no longer needs decisions. */
	public clear(): void
	{
		this._loadGeneration += 1;
		this._runId = null;
		this.loading.set(false);
		this.error.set(null);
		this.cards.set([]);
		this._retryDecisions.clear();
	}

	/** Read display-safe pending approvals and keep only cards for this run. */
	private async _load(runId: string): Promise<void>
	{
		this._runId = runId;
		this._loadGeneration += 1;
		const generation = this._loadGeneration;
		this.loading.set(true);
		this.error.set(null);
		try
		{
			const approvals = await this._gateway.listPending();
			if (generation !== this._loadGeneration) return;
			this.cards.set(approvals.filter(function _forRun(approval: ApprovalCardView): boolean { return approval.runId === runId; }));
		}
		catch
		{
			if (generation !== this._loadGeneration) return;
			this.error.set("OpenCrane could not load pending approvals. Try again.");
		}
		finally
		{
			if (generation === this._loadGeneration) this.loading.set(false);
		}
	}

	/** Record one terminal approval decision, then ask the route to refresh progress. */
	private async _decide(approvalId: string, decision: ApprovalDecisions): Promise<void>
	{
		this._retryDecisions.set(approvalId, decision);
		this._updateStatus(approvalId, decision === ApprovalDecisions.Approve ? ApprovalDecisionStates.Approving : ApprovalDecisionStates.Denying);
		try
		{
			this._applyDecision(await this._gateway.decide({ approvalId, decision }));
		}
		catch
		{
			this._updateStatus(approvalId, ApprovalDecisionStates.Failed);
		}
		this._onDecisionRecorded();
	}

	/** Apply a typed gateway result to one local card. */
	private _applyDecision(result: ApprovalDecisionResult): void
	{
		if (!result.retryable) this._retryDecisions.delete(result.approvalId);
		this._updateStatus(result.approvalId, result.state);
	}

	/** Update one approval card status without changing server-owned fields. */
	private _updateStatus(approvalId: string, status: ApprovalDecisionStates): void
	{
		this.cards.update(function _update(approvals: readonly ApprovalCardView[]): readonly ApprovalCardView[]
		{
			return approvals.map(function _map(approval: ApprovalCardView): ApprovalCardView
			{
				if (approval.approvalId !== approvalId) return approval;
				return { ...approval, status };
			});
		});
	}
}
