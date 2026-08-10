import { SettingsMutation, SettingsMutationOutcome } from "@opencrane/core";

import { WorkspaceBudgetDraft, WorkspaceBudgetMember } from "@opencrane/state/settings/adapter";

/** Exact member budget fixture from the authoritative App.dc.html handoff. */
export const WORKSPACE_BUDGET_MEMBERS_FIXTURE: readonly WorkspaceBudgetMember[] =
[
	{ id: "1", name: "Jente Rosseel", role: "member", spent: 124, avatar: "JR", avatarBackground: "var(--oc-blue)" },
	{ id: "2", name: "Sarah Odhiambo", role: "member", spent: 32, avatar: "SO", avatarBackground: "var(--oc-avatar-green)" },
	{ id: "3", name: "David Kimani", role: "member", spent: 48, avatar: "DK", avatarBackground: "var(--oc-red)" },
	{ id: "4", name: "Amara Osei", role: "viewer", spent: 8, avatar: "AO", avatarBackground: "var(--oc-amber)" },
	{ id: "5", name: "Liam van der Berg", role: "admin", spent: 61, avatar: "LB", avatarBackground: "var(--wo-scope-dept-accent)" }
];

/** Editable limits paired with the handoff members. */
export const WORKSPACE_BUDGET_DRAFT_FIXTURE: WorkspaceBudgetDraft = { limits: { "1": 150, "2": 50, "3": 50, "4": 25, "5": 75 } };

/** Reset date displayed in the organization summary. */
export const WORKSPACE_BUDGET_RESET_DATE_FIXTURE = "Jul 1, 2026";

/** Successful deterministic mutation used by the default mock screen. */
export const WORKSPACE_BUDGET_SUCCESS_MUTATION: SettingsMutation<WorkspaceBudgetDraft> =
{
	/** Accept one captured draft without persistence. */
	mutate: async function mutate(draft: WorkspaceBudgetDraft)
	{
		return { outcome: SettingsMutationOutcome.Success, accepted: structuredClone(draft), message: "Budget changes saved." };
	}
};
