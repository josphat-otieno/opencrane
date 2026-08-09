import { Injectable, inject } from "@angular/core";

import { ControlPlaneApiService } from "@opencrane/core";

import { ApprovalDecisionFailures, ApprovalDecisionStates, ApprovalDecisions, type ApprovalCardView, type ApprovalDecisionGateway, type ApprovalDecisionRequest, type ApprovalDecisionResult } from "./approval-decision.types.js";

/** Wire shape returned by the generated pending-approval endpoint. */
interface _SelfDeferredToolApprovalWire
{
	/** Opaque approval identifier. */
	readonly approvalRequestId: string;
	/** Opaque run identifier associated with the approval. */
	readonly runId: string;
	/** Run attempt number. */
	readonly attempt: number;
	/** Redacted tool revision identifier safe for display as a technical label. */
	readonly toolRevisionId: string;
	/** ISO-8601 expiry timestamp. */
	readonly expiresAt: string;
	/** ISO-8601 creation timestamp. */
	readonly createdAt: string;
}

/** Live approval gateway backed by the signed-in OpenCrane API. */
@Injectable()
export class OpenCraneApprovalDecisionGateway implements ApprovalDecisionGateway
{
	/** Generated API client carrying the browser session. */
	private readonly _api = inject(ControlPlaneApiService);

	/** @inheritdoc */
	public async listPending(): Promise<readonly ApprovalCardView[]>
	{
		const { data, error } = await this._api.client.GET("/me/approvals");
		if (error || data === undefined) throw new Error("pending approvals are unavailable");
		return data.approvals.map(_approvalCard);
	}

	/** @inheritdoc */
	public async decide(request: ApprovalDecisionRequest): Promise<ApprovalDecisionResult>
	{
		const { data, error, response } = await this._api.client.POST("/me/approvals/{approvalRequestId}/decision", {
			params: { path: { approvalRequestId: request.approvalId } },
			body: { decision: request.decision }
		});
		if (data !== undefined) return _decisionResult(data.approvalRequestId, data.state);
		return _failureResult(request.approvalId, _failureForStatus(response?.status ?? null, error));
	}
}

/** Map one redacted wire approval into UI card state. */
function _approvalCard(wire: _SelfDeferredToolApprovalWire): ApprovalCardView
{
	return {
		approvalId: wire.approvalRequestId,
		runId: wire.runId,
		title: "Tool approval required",
		description: `Run attempt ${wire.attempt} is waiting for your decision.`,
		toolName: wire.toolRevisionId,
		requestedAt: wire.createdAt,
		expiresAt: wire.expiresAt,
		status: ApprovalDecisionStates.Pending,
		attempt: wire.attempt
	};
}

/** Map a successful server decision into browser-visible state. */
function _decisionResult(approvalId: string, state: "approved" | "denied"): ApprovalDecisionResult
{
	return {
		approvalId,
		state: state === ApprovalDecisions.Approve ? ApprovalDecisionStates.Approved : ApprovalDecisionStates.Denied,
		retryable: false
	};
}

/** Create a failed decision result from a typed failure category. */
function _failureResult(approvalId: string, failure: ApprovalDecisionFailures): ApprovalDecisionResult
{
	return {
		approvalId,
		state: _stateForFailure(failure),
		failure,
		retryable: failure === ApprovalDecisionFailures.Unavailable
	};
}

/** Convert one decision failure category into card state. */
function _stateForFailure(failure: ApprovalDecisionFailures): ApprovalDecisionStates
{
	if (failure === ApprovalDecisionFailures.Unavailable) return ApprovalDecisionStates.Failed;
	if (failure === ApprovalDecisionFailures.Expired) return ApprovalDecisionStates.Expired;
	return ApprovalDecisionStates.Stale;
}

/** Map HTTP status into user-safe approval failure categories. */
function _failureForStatus(status: number | null, error: unknown): ApprovalDecisionFailures
{
	switch (status)
	{
		case 400:
			return ApprovalDecisionFailures.InvalidRequest;
		case 401:
			return ApprovalDecisionFailures.AuthenticationRequired;
		case 403:
			return ApprovalDecisionFailures.NotAuthorized;
		case 404:
			return ApprovalDecisionFailures.StaleDecision;
		case 409:
			return ApprovalDecisionFailures.Expired;
		case 503:
			return ApprovalDecisionFailures.Unavailable;
	}
	if (error !== undefined) return ApprovalDecisionFailures.Unknown;
	return ApprovalDecisionFailures.Unknown;
}
