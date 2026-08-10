import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/** Read the workspace shell template as normalized markup for consumer-contract checks. */
function _workspaceTemplate(): string
{
	return readFileSync(resolve(process.cwd(), "src/lib/workspace-page.component.html"), "utf8").replace(/\s+/g, " ");
}

describe("Sidebar avatar contract", function sidebarAvatarSuite(): void
{
	it("keeps account identity visible in the workspace rail", function avatarContract(): void
	{
		const template = _workspaceTemplate();

		expect(template).toContain("{{ userInitials() }}");
		expect(template).toContain("{{ userName() }}");
		expect(template).not.toMatch(/#[0-9a-fA-F]{3,6}/);
	});
});
