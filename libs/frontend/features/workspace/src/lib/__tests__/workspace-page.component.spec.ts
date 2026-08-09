import { Injector, runInInjectionContext } from "@angular/core";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { SessionStore } from "@opencrane/state/core";
import { CONVERSATION_HISTORY_GATEWAY } from "@opencrane/state/conversation/adapter";

import { WorkspacePageComponent } from "../workspace-page.component";

describe("WorkspacePageComponent", function _Suite()
{
	function _component(logout: _LogoutCallback): WorkspacePageComponent
	{
		const injector = Injector.create({
			providers: [
				{
					provide: CONVERSATION_HISTORY_GATEWAY,
					useValue: { listRecent: async function _listRecent() { return []; } }
				},
				{
					provide: SessionStore,
					useValue: {
						displayName: function _displayName() { return "Ada Lovelace"; },
						logout
					}
				}
			]
		});

		return runInInjectionContext(injector, function _create(): WorkspacePageComponent
		{
			return new WorkspacePageComponent();
		});
	}

	it("exposes a retryable error instead of rejecting when logout fails", async function _HandlesLogoutFailure()
	{
		const component = _component(async function _logout(): Promise<void>
		{
			throw new Error("offline");
		});

		await expect(component.logout()).resolves.toBeUndefined();
		expect(component.logoutPending()).toBe(false);
		expect(component.logoutError()).toBe(true);
	});

	it("clears a previous error after a successful retry", async function _ClearsLogoutFailure()
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

	it("refreshes history when a routed conversation emits a refresh request", function _RefreshesFromRoutedOutput()
	{
		const component = _component(async function _logout(): Promise<void> {});
		const retry = vi.spyOn(component, "retryHistory");
		const routed = {
			historyRefreshRequested: {
				subscribe: function _subscribe(callback: _HistoryRefreshCallback)
				{
					callback();
					return { unsubscribe: function _unsubscribe(): void {} };
				}
			}
		};

		component.attachRoutedFeature(routed);

		expect(retry).toHaveBeenCalled();
	});

	it("keeps retired project concepts out of visible workspace copy", function _KeepsRetiredCopyOut()
	{
		const shellTemplate = readFileSync(new URL("../workspace-page.component.html", import.meta.url), "utf8");
		const historyTemplate = readFileSync(new URL("../workspace-history.component.html", import.meta.url), "utf8");
		const visibleTemplate = shellTemplate.toLowerCase();
		const retiredProduct = "open" + "claw";

		expect(visibleTemplate).not.toContain(retiredProduct);
		expect(visibleTemplate).not.toContain("new session");
		expect(visibleTemplate).not.toContain("my sessions");
		expect(visibleTemplate).not.toContain("pod token");
		expect(visibleTemplate).not.toContain("pod.");
		expect(shellTemplate).toContain("(activate)=\"attachRoutedFeature($event)\"");
		expect(shellTemplate).toContain("(deactivate)=\"detachRoutedFeature()\"");
		expect(historyTemplate).toContain("[queryParams]=\"{ runId: entry.runId }\"");
	});
});

/** Callback used by the routed refresh-output fixture. */
interface _HistoryRefreshCallback
{
	/** Ask the workspace shell to refresh history. */
	(): void;
}

/** Callback used by the session-store logout fixture. */
interface _LogoutCallback
{
	/** End the fake session. */
	(): Promise<void>;
}
