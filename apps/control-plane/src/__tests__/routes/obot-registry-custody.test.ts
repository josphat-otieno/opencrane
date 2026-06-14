import { describe, expect, it } from "vitest";

import { _BuildObotRegistryItem } from "../../routes/internal/obot-registry.js";
import type { ObotRegistrySourceRow } from "../../routes/internal/obot-registry.types.js";

const _ROW: ObotRegistrySourceRow = {
	id: "srv_1",
	name: "GitHub",
	description: "GitHub MCP server",
	endpoint: "https://github.example/mcp",
};

describe("_BuildObotRegistryItem (P4D.1 custody — no secret leak)", function _suite()
{
	it("maps the server into the Obot wire item", function _maps()
	{
		const item = _BuildObotRegistryItem(_ROW);
		expect(item).toEqual({
			id: "srv_1",
			name: "GitHub",
			description: "GitHub MCP server",
			remotes: [{ name: "GitHub", url: "https://github.example/mcp" }],
		});
	});

	it("never emits credential or secret material on the registry-sync path", function _noSecret()
	{
		// Build from a row deliberately polluted with secret-shaped extras to prove
		// the mapper projects an explicit allow-list and cannot leak custody fields.
		const polluted = { ..._ROW, secretRef: "vault://leak", credentials: [{ secretRef: "vault://leak" }] } as unknown as ObotRegistrySourceRow;
		const serialized = JSON.stringify(_BuildObotRegistryItem(polluted));
		expect(serialized).not.toContain("secret");
		expect(serialized).not.toContain("credential");
		expect(serialized).not.toContain("vault://leak");
	});
});
