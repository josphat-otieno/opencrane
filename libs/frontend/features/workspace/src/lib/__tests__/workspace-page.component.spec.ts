import { Injector, runInInjectionContext } from "@angular/core";
import { readFileSync } from "node:fs";

import { SessionStore } from "@opencrane/state/core";

import { WorkspacePageComponent } from "../workspace-page.component";

describe("WorkspacePageComponent", () =>
{
	function _component(logout: () => Promise<void>): WorkspacePageComponent
	{
		const injector = Injector.create({
			providers: [
				{
					provide: SessionStore,
					useValue: {
						displayName: function _displayName() { return "Ada Lovelace"; },
						logout
					}
				}
			]
		});

		return runInInjectionContext(injector, () => new WorkspacePageComponent());
	}

	it("exposes a retryable error instead of rejecting when logout fails", async () =>
	{
		const component = _component(async function _logout(): Promise<void>
		{
			throw new Error("offline");
		});

		await expect(component.logout()).resolves.toBeUndefined();
		expect(component.logoutPending()).toBe(false);
		expect(component.logoutError()).toBe(true);
	});

	it("clears a previous error after a successful retry", async () =>
	{
		let attempt = 0;
		const component = _component(async function _logout(): Promise<void>
		{
			attempt += 1;
			if (attempt === 1) throw new Error("offline");
		});

		await component.logout();
		await component.logout();

		expect(component.logoutError()).toBe(false);
	});

	it("keeps retired OpenClaw concepts out of visible workspace copy", () =>
	{
		const shellTemplate = readFileSync(new URL("../workspace-page.component.html", import.meta.url), "utf8");
		const visibleTemplate = shellTemplate.toLowerCase();

		expect(visibleTemplate).not.toContain("openclaw");
		expect(visibleTemplate).not.toContain("new session");
		expect(visibleTemplate).not.toContain("my sessions");
		expect(visibleTemplate).not.toContain("pod token");
		expect(visibleTemplate).not.toContain("pod.");
	});
});
