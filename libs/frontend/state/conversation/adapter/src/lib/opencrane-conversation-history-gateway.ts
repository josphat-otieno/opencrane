import { Injectable, inject } from "@angular/core";

import type { paths } from "@opencrane/contracts";
import { ControlPlaneApiService } from "@opencrane/core";

import type { ConversationHistoryEntryView } from "./conversation-display.types.js";
import type { ConversationHistoryGateway } from "./conversation-gateway.types.js";

/** Public run status returned by the generated owner-run listing contract. */
type _SelfRunStatus = paths["/me/runs"]["get"]["responses"][200]["content"]["application/json"]["runs"][number];

/** Cookie-session reader for recent owner conversation threads. */
@Injectable()
export class OpenCraneConversationHistoryGateway implements ConversationHistoryGateway
{
	/** Generated Control Plane client carrying the browser's existing session cookie. */
	private readonly _api = inject(ControlPlaneApiService);

	/** @inheritdoc */
	public async listRecent(): Promise<readonly ConversationHistoryEntryView[]>
	{
		const { data, error } = await this._api.client.GET("/me/runs");
		if (error || data === undefined) throw new Error("conversation history is unavailable");
		return _toConversationHistoryEntries(data.runs);
	}
}

/** Map newest-first run summaries into one display row per canonical thread. */
export function __ToConversationHistoryEntries(runs: readonly paths["/me/runs"]["get"]["responses"][200]["content"]["application/json"]["runs"][number][]): readonly ConversationHistoryEntryView[]
{
	return _toConversationHistoryEntries(runs);
}

/** Keep only the newest known run per thread and expose no raw owner coordinates. */
function _toConversationHistoryEntries(runs: readonly _SelfRunStatus[]): readonly ConversationHistoryEntryView[]
{
	const byThread = new Map<string, ConversationHistoryEntryView>();
	for (const run of runs)
	{
		if (run.threadId === null || byThread.has(run.threadId)) continue;
		byThread.set(run.threadId, {
			threadId: run.threadId,
			runId: run.runId,
			title: _titleFor(run.acceptedAt),
			updatedAt: run.finishedAt ?? run.acceptedAt,
			recency: _labelForState(run.state)
		});
	}
	return [...byThread.values()].sort(function _newestFirst(left: ConversationHistoryEntryView, right: ConversationHistoryEntryView): number
	{
		return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
	});
}

/** Build a human title from public timestamps when no authored title contract exists yet. */
function _titleFor(acceptedAt: string): string
{
	const date = new Date(acceptedAt);
	if (Number.isNaN(date.getTime())) return "Conversation";
	return `Conversation from ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Convert public lifecycle categories into compact history labels. */
function _labelForState(state: _SelfRunStatus["state"]): string
{
	switch (state)
	{
		case "accepted":
		case "queued":
		case "assigned":
			return "Queued";
		case "running":
			return "Running";
		case "waiting_for_approval":
			return "Needs approval";
		case "cancelling":
			return "Cancelling";
		case "completed":
			return "Completed";
		case "failed":
			return "Failed";
		case "cancelled":
			return "Cancelled";
	}
	const unhandled: never = state;
	return unhandled;
}
