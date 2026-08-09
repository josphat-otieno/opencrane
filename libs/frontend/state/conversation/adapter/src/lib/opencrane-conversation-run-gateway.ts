import { Injectable, inject } from "@angular/core";

import type { paths } from "@opencrane/contracts";
import { ControlPlaneApiService } from "@opencrane/core";

import { ConversationRunAdmissionFailures, ConversationRunAdmissionOutcomes, ConversationRunLifecycleStates, type ConversationRunAdmissionAttempt, type ConversationRunAdmissionResult, type ConversationRunGateway, type ConversationRunStatusView } from "./conversation-run.types.js";

/** Public run status returned by generated owner-run contracts. */
type _SelfRunStatus = paths["/me/runs/{runId}"]["get"]["responses"][200]["content"]["application/json"];

/** Live gateway for OpenCrane personal run admission and status reads. */
@Injectable()
export class OpenCraneConversationRunGateway implements ConversationRunGateway
{
	/** Generated Control Plane client carrying the browser's existing session cookie. */
	private readonly _api = inject(ControlPlaneApiService);

	/** @inheritdoc */
	public createAdmissionAttempt(threadId: string): ConversationRunAdmissionAttempt
	{
		if (threadId.trim().length === 0) throw new Error("conversation thread id is required");
		return { threadId, requestIdempotencyKey: `conversation-submit:${threadId}:${_clientAttemptId()}` };
	}

	/** @inheritdoc */
	public async admitRun(attempt: ConversationRunAdmissionAttempt): Promise<ConversationRunAdmissionResult>
	{
		const { data, error, response } = await this._api.client.POST("/me/runs", {
			body: {
				threadId: attempt.threadId,
				requestIdempotencyKey: attempt.requestIdempotencyKey
			}
		});
		if (error || data === undefined) return _failureResult(response?.status);
		return {
			outcome: response?.status === 200 ? ConversationRunAdmissionOutcomes.Idempotent : ConversationRunAdmissionOutcomes.Accepted,
			runId: data.runId,
			retryable: false
		};
	}

	/** @inheritdoc */
	public async getRunStatus(runId: string): Promise<ConversationRunStatusView>
	{
		if (runId.trim().length === 0) throw new Error("conversation run id is required");
		const { data, error } = await this._api.client.GET("/me/runs/{runId}", {
			params: { path: { runId } }
		});
		if (error || data === undefined) throw new Error("conversation run status is unavailable");
		return _toRunStatusView(data);
	}
}

/** Generate a browser-local retry key suffix; the server remains authoritative. */
function _clientAttemptId(): string
{
	if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Map HTTP status into a browser-safe admission failure. */
function _failureResult(status: number | undefined): ConversationRunAdmissionResult
{
	const failure = _failureForStatus(status);
	return { outcome: ConversationRunAdmissionOutcomes.Failed, failure, retryable: _retryableFailure(failure) };
}

/** Translate generated-client response status into a user-safe category. */
function _failureForStatus(status: number | undefined): ConversationRunAdmissionFailures
{
	switch (status)
	{
		case 400:
			return ConversationRunAdmissionFailures.InvalidRequest;
		case 401:
			return ConversationRunAdmissionFailures.AuthenticationRequired;
		case 403:
			return ConversationRunAdmissionFailures.AdmissionEvidenceUnavailable;
		case 429:
			return ConversationRunAdmissionFailures.AdmissionCapacityFull;
		case 503:
			return ConversationRunAdmissionFailures.Unavailable;
		default:
			return ConversationRunAdmissionFailures.Unknown;
	}
}

/** Return whether one mapped failure should expose a retry action. */
function _retryableFailure(failure: ConversationRunAdmissionFailures): boolean
{
	switch (failure)
	{
		case ConversationRunAdmissionFailures.AdmissionCapacityFull:
		case ConversationRunAdmissionFailures.Unavailable:
		case ConversationRunAdmissionFailures.Unknown:
			return true;
		case ConversationRunAdmissionFailures.InvalidRequest:
		case ConversationRunAdmissionFailures.AuthenticationRequired:
		case ConversationRunAdmissionFailures.AdmissionEvidenceUnavailable:
			return false;
	}
}

/** Convert generated run status into the feature view model. */
function _toRunStatusView(status: _SelfRunStatus): ConversationRunStatusView
{
	return {
		runId: status.runId,
		attempt: status.attempt,
		state: _lifecycleState(status.state),
		threadId: status.threadId,
		agentRevisionId: status.agentRevisionId,
		acceptedAt: status.acceptedAt,
		finishedAt: status.finishedAt
	};
}

/** Narrow generated lifecycle strings onto the frontend enum. */
function _lifecycleState(state: _SelfRunStatus["state"]): ConversationRunLifecycleStates
{
	switch (state)
	{
		case "accepted":
			return ConversationRunLifecycleStates.Accepted;
		case "queued":
			return ConversationRunLifecycleStates.Queued;
		case "assigned":
			return ConversationRunLifecycleStates.Assigned;
		case "running":
			return ConversationRunLifecycleStates.Running;
		case "waiting_for_approval":
			return ConversationRunLifecycleStates.WaitingForApproval;
		case "cancelling":
			return ConversationRunLifecycleStates.Cancelling;
		case "completed":
			return ConversationRunLifecycleStates.Completed;
		case "failed":
			return ConversationRunLifecycleStates.Failed;
		case "cancelled":
			return ConversationRunLifecycleStates.Cancelled;
	}
	const unhandled: never = state;
	return unhandled;
}
