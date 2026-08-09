import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it, vi } from "vitest";

import { ControlPlaneApiService } from "@opencrane/core";

import { ApprovalDecisionFailures, ApprovalDecisionStates, ApprovalDecisions } from "../approval-decision.types.js";
import { OpenCraneApprovalDecisionGateway } from "../opencrane-approval-decision-gateway.js";

/** Construct an approval gateway with controlled generated-client methods. */
function _gateway(get = vi.fn(), post = vi.fn()): { readonly gateway: OpenCraneApprovalDecisionGateway; readonly get: ReturnType<typeof vi.fn>; readonly post: ReturnType<typeof vi.fn> }
{
	const injector = Injector.create({ providers: [{ provide: ControlPlaneApiService, useValue: { client: { GET: get, POST: post } } }] });
	const gateway = runInInjectionContext(injector, function _create(): OpenCraneApprovalDecisionGateway
	{
		return new OpenCraneApprovalDecisionGateway();
	});
	return { gateway, get, post };
}

describe("OpenCraneApprovalDecisionGateway", function _Suite()
{
	it("lists only display-safe pending approval fields", async function _ListsPendingApprovals()
	{
		const get = vi.fn().mockResolvedValue({ data: { approvals: [{ approvalRequestId: "approval-1", runId: "run-1", attempt: 2, toolRevisionId: "tool-revision-1", expiresAt: "2026-08-09T13:00:00.000Z", createdAt: "2026-08-09T12:00:00.000Z" }] } });
		const { gateway } = _gateway(get);

		const approvals = await gateway.listPending();

		expect(get).toHaveBeenCalledWith("/me/approvals");
		expect(approvals[0]).toMatchObject({ approvalId: "approval-1", runId: "run-1", toolName: "tool-revision-1", status: ApprovalDecisionStates.Pending });
		expect(JSON.stringify(approvals)).not.toContain("arguments");
	});

	it("posts only the terminal approve decision body", async function _ApprovesWithDecisionOnly()
	{
		const post = vi.fn().mockResolvedValue({ data: { approvalRequestId: "approval-1", state: "approved" } });
		const { gateway } = _gateway(vi.fn(), post);

		const result = await gateway.decide({ approvalId: "approval-1", decision: ApprovalDecisions.Approve });

		expect(post).toHaveBeenCalledWith("/me/approvals/{approvalRequestId}/decision", { params: { path: { approvalRequestId: "approval-1" } }, body: { decision: "approved" } });
		expect(result).toEqual({ approvalId: "approval-1", state: ApprovalDecisionStates.Approved, retryable: false });
	});

	it("posts only the terminal deny decision body", async function _DeniesWithDecisionOnly()
	{
		const post = vi.fn().mockResolvedValue({ data: { approvalRequestId: "approval-1", state: "denied" } });
		const { gateway } = _gateway(vi.fn(), post);

		const result = await gateway.decide({ approvalId: "approval-1", decision: ApprovalDecisions.Deny });

		expect(post).toHaveBeenCalledWith("/me/approvals/{approvalRequestId}/decision", { params: { path: { approvalRequestId: "approval-1" } }, body: { decision: "denied" } });
		expect(result).toEqual({ approvalId: "approval-1", state: ApprovalDecisionStates.Denied, retryable: false });
	});

	it("maps stale and retryable failures without exposing backend detail", async function _MapsDecisionFailures()
	{
		const post = vi.fn()
			.mockResolvedValueOnce({ error: { error: "expired" }, response: { status: 409 } })
			.mockResolvedValueOnce({ error: { error: "down" }, response: { status: 503 } });
		const { gateway } = _gateway(vi.fn(), post);

		await expect(gateway.decide({ approvalId: "approval-1", decision: ApprovalDecisions.Approve })).resolves.toEqual({ approvalId: "approval-1", state: ApprovalDecisionStates.Expired, failure: ApprovalDecisionFailures.Expired, retryable: false });
		await expect(gateway.decide({ approvalId: "approval-1", decision: ApprovalDecisions.Deny })).resolves.toEqual({ approvalId: "approval-1", state: ApprovalDecisionStates.Failed, failure: ApprovalDecisionFailures.Unavailable, retryable: true });
	});
});
