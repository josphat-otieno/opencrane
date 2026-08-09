import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it, vi } from "vitest";

import type { paths } from "@opencrane/contracts";
import { ControlPlaneApiService } from "@opencrane/core";

import { OpenCraneConversationHistoryGateway, __ToConversationHistoryEntries } from "../opencrane-conversation-history-gateway.js";

/** Public run status returned by the generated owner-run listing contract. */
type _SelfRunStatus = paths["/me/runs"]["get"]["responses"][200]["content"]["application/json"]["runs"][number];

/** Build one generated-contract run status fixture. */
function _run(runId: string, threadId: string | null, state: _SelfRunStatus["state"], acceptedAt: string, finishedAt: string | null = null): _SelfRunStatus
{
	return { runId, threadId, state, acceptedAt, finishedAt, attempt: 1, agentRevisionId: "agent-revision-1" };
}

/** Construct the live gateway with a controlled generated-client response. */
function _gateway(runs: readonly _SelfRunStatus[])
{
	const get = vi.fn().mockResolvedValue({ data: { runs } });
	const injector = Injector.create({ providers: [{ provide: ControlPlaneApiService, useValue: { client: { GET: get } } }] });
	const gateway = runInInjectionContext(injector, function _create(): OpenCraneConversationHistoryGateway
	{
		return new OpenCraneConversationHistoryGateway();
	});
	return { gateway, get };
}

describe("OpenCraneConversationHistoryGateway", function _Suite()
{
	it("reads the generated owner-run list endpoint", async function _ReadsEndpoint()
	{
		const { gateway, get } = _gateway([_run("run-1", "thread-1", "completed", "2026-08-08T10:00:00.000Z")]);

		const entries = await gateway.listRecent();

		expect(get).toHaveBeenCalledWith("/me/runs");
		expect(entries[0]?.threadId).toBe("thread-1");
		expect(entries[0]?.runId).toBe("run-1");
	});

	it("keeps the newest public run summary per thread and hides threadless runs", function _MapsRuns()
	{
		const entries = __ToConversationHistoryEntries([
			_run("run-new", "thread-1", "running", "2026-08-08T12:00:00.000Z"),
			_run("run-old", "thread-1", "completed", "2026-08-08T08:00:00.000Z"),
			_run("run-other", "thread-2", "waiting_for_approval", "2026-08-08T11:00:00.000Z"),
			_run("run-threadless", null, "completed", "2026-08-08T09:00:00.000Z")
		]);

		expect(entries.map(function _thread(entry): string { return entry.threadId; })).toEqual(["thread-1", "thread-2"]);
		expect(entries[0]?.recency).toBe("Running");
		expect(entries[1]?.recency).toBe("Needs approval");
	});
});
