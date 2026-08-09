import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("ConversationApprovalCardComponent", function _Suite()
{
	it("renders approve deny and retry without accepting runtime authority fields", function _RendersDecisionActions()
	{
		const template = readFileSync("src/lib/components/approval-card/conversation-approval-card.component.html", "utf8").toLowerCase();
		const source = readFileSync("src/lib/components/approval-card/conversation-approval-card.component.ts", "utf8").toLowerCase();
		const visible = `${template}\n${source}`;

		expect(template).toContain("(click)=\"deny()\"");
		expect(template).toContain("(click)=\"approve()\"");
		expect(template).toContain("(click)=\"retry()\"");
		expect(source).toContain("approverequested = output<string>()");
		expect(source).toContain("denyrequested = output<string>()");
		expect(source).toContain("retryrequested = output<string>()");
		expect(visible).not.toContain("tool result");
		expect(visible).not.toContain("resume credential");
		expect(visible).not.toContain("subject");
	});

	it("exposes accessible failed and stale decision states", function _RendersAccessibleStates()
	{
		const template = readFileSync("src/lib/components/approval-card/conversation-approval-card.component.html", "utf8");
		const source = readFileSync("src/lib/components/approval-card/conversation-approval-card.component.ts", "utf8");

		expect(template).toContain("[attr.role]=\"role()\"");
		expect(template).toContain("role=\"alert\"");
		expect(source).toContain("ApprovalDecisionStates.Failed ? \"alert\" : \"status\"");
		expect(source).toContain("ApprovalDecisionStates.Expired");
	});
});
