// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SessionStore } from "@opencrane/state/core";
import { CONVERSATION_HISTORY_GATEWAY } from "@opencrane/state/conversation/adapter";

import { WorkspacePageComponent } from "../workspace-page.component";

describe("WorkspacePageComponent", function _Suite()
{
	function _component(logout: _LogoutCallback): WorkspacePageComponent
	{
		TestBed.configureTestingModule({
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

		return TestBed.runInInjectionContext(function _create(): WorkspacePageComponent
		{
			return new WorkspacePageComponent();
		});
	}

	beforeAll(function _PrepareAngular(): void
	{
		TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
	});

	afterEach(function _ResetAngular(): void
	{
		TestBed.resetTestingModule();
	});

	afterAll(function _ReleaseAngular(): void
	{
		TestBed.resetTestEnvironment();
	});

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
		const shellTemplate = readFileSync(resolve(process.cwd(), "src/lib/workspace-page.component.html"), "utf8");
		const historyTemplate = readFileSync(resolve(process.cwd(), "src/lib/workspace-history.component.html"), "utf8");
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
