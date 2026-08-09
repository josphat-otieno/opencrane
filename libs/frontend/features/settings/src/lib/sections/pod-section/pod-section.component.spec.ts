// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { signal } from "@angular/core";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { MockSettingsGateway } from "@opencrane/state/gateways/testing";

import { SettingsFormPhase, SettingsUnsavedNavigationConfirmation, _CreateSettingsFormState } from "@opencrane/core";
import { POD_SETTINGS_FIXTURE } from "@opencrane/state/gateways/testing";
import { PodSettingsDraftFixture } from "@opencrane/state/settings/adapter";
import { PodSectionComponent } from "./pod-section.component.js";
import { _CanDeactivatePodSection } from "./pod-section.guard.js";

beforeAll(function prepareAngular(): void
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
});

afterAll(function releaseAngular(): void
{
	TestBed.resetTestEnvironment();
});

/** Create one native-like input event for the component boundary. */
function _inputEvent(value: string): Event
{
	return { target: { value } } as unknown as Event;
}
function setupComponent() {
    const gateway = new MockSettingsGateway();
    TestBed.configureTestingModule({
        providers: [
            { provide: SETTINGS_GATEWAY, useValue: gateway },
            { provide: ActiveTenantStore, useValue: { tenant: signal("elewa-default") } }
        ]
    });
    const component = TestBed.runInInjectionContext(() => new PodSectionComponent());
    component.formState.set(_CreateSettingsFormState(POD_SETTINGS_FIXTURE.draft));
    return { component, gateway };
}

describe("PodSectionComponent", function podSectionSuite(): void
{
	it("renders the authoritative Pod fixture without interim content", function rendersFixture(): void
	{
		const template = readFileSync(resolve(process.cwd(), "src/lib/sections/pod-section/pod-section.component.html"), "utf8");

		expect(POD_SETTINGS_FIXTURE).toMatchObject({ podId: "elewa-default", latestVersion: "2026.5.28", draft: { displayName: "Elewa Group workspace", version: "2026.3.15", autoUpdate: true } });
		expect(POD_SETTINGS_FIXTURE.storageStats.map(function value(stat): string { return stat.value; })).toEqual(["2.3 GB", "20 GB", "AES-256"]);
		expect(template).toContain('title="Pod" subtitle="Your isolated OpenCrane instance."');
		expect(template).not.toContain("Pod & Session");
		expect(template).not.toContain("Open" + "C" + "law");
		expect(template).not.toContain('label="Phase"');
	});

	it("preserves the valid sibling value while reporting required-field errors", function validatesDraft(): void
	{
		const { component, gateway } = setupComponent();
		component.editVersion(_inputEvent("2026.6.1"));
		component.editDisplayName(_inputEvent("   "));

		expect(component.formState().phase).toBe(SettingsFormPhase.Invalid);
		expect(component.formState().draft.version).toBe("2026.6.1");
		expect(component.formState().validationErrors["displayName"]).toBe("Enter a display name.");
	});

	it("returns to pristine when the complete draft matches its baseline again", function revertedDraft(): void
	{
		const { component, gateway } = setupComponent();
		component.editDisplayName(_inputEvent("Changed"));
		expect(component.formState().phase).toBe(SettingsFormPhase.Dirty);

		component.editDisplayName(_inputEvent(POD_SETTINGS_FIXTURE.draft.displayName));
		expect(component.formState().phase).toBe(SettingsFormPhase.Pristine);
	});

	it("includes auto-update in a successful save and resets to the accepted baseline", async function savesAndResets(): Promise<void>
	{
		const { component, gateway } = setupComponent();
		const accepted: PodSettingsDraftFixture = { displayName: "Elewa Production", version: "2026.5.28", autoUpdate: false };
		vi.spyOn(gateway, "updatePodSettings").mockResolvedValue({ draft: accepted } as any);
		component.editAutoUpdate(false);
		component.editDisplayName(_inputEvent(accepted.displayName));
		component.editVersion(_inputEvent(accepted.version));

		await component.submit();
		expect(gateway.updatePodSettings).toHaveBeenCalledWith("elewa-default", accepted);
		expect(component.formState().phase).toBe(SettingsFormPhase.Success);
		expect(component.formState().baseline).toEqual(accepted);

		component.editDisplayName(_inputEvent("Unsaved name"));
		component.reset();
		expect(component.formState().draft).toEqual(accepted);
		expect(component.formState().phase).toBe(SettingsFormPhase.Pristine);
	});

	it("locks edits and duplicate submission during a delayed attempt", async function pendingLock(): Promise<void>
	{
		const { component, gateway } = setupComponent();
		let resolveUpdate: any;
		vi.spyOn(gateway, "updatePodSettings").mockImplementation(() => new Promise(r => resolveUpdate = r));
		component.editDisplayName(_inputEvent("Elewa updated"));

		const first = component.submit();
		const duplicate = component.submit();
		component.editVersion(_inputEvent("blocked"));

		expect(component.formState().phase).toBe(SettingsFormPhase.Pending);
		expect(component.pending()).toBe(true);
		expect(component.formState().draft.version).toBe("2026.3.15");
		expect(gateway.updatePodSettings).toHaveBeenCalledTimes(1);
		resolveUpdate({ draft: { displayName: "Elewa updated", version: "2026.3.15" }}); await Promise.all([first, duplicate]);
	});


	it("preserves a retryable draft after a recoverable error", async function errorRecovery(): Promise<void>
	{
		const { component, gateway } = setupComponent();
		vi.spyOn(gateway, "updatePodSettings").mockRejectedValue(new Error("Recoverable error"));
		component.editAutoUpdate(false);
		const submitted = component.formState().draft;

		await component.submit();
		expect(component.formState().phase).toBe(SettingsFormPhase.RecoverableError);
		expect(component.formState().draft).toEqual(submitted);
	});

	it("recovers when the mutation throws instead of returning an error result", async function thrownErrorRecovery(): Promise<void>
	{
		const { component, gateway } = setupComponent();
		vi.spyOn(gateway, "updatePodSettings").mockRejectedValue(new Error("Pod save failed."));
		component.editAutoUpdate(false);
		const submitted = component.formState().draft;

		await component.submit();
		const state = component.formState();
		expect(state.phase).toBe(SettingsFormPhase.RecoverableError);
		expect(state.draft).toEqual(submitted);
		if (state.phase === SettingsFormPhase.RecoverableError) {
			expect(state.feedback.message).toBe("Pod save failed.");
		}
	});

	it("delegates only unsafe phases to the shared navigation confirmation", function confirmsNavigation(): void
	{
		const { component, gateway } = setupComponent();
		const confirmation: SettingsUnsavedNavigationConfirmation = { confirmDiscardChanges: vi.fn(function reject(): boolean { return false; }) };

		expect(component.canDeactivate(confirmation)).toBe(true);
		component.editAutoUpdate(false);
		expect(component.canDeactivate(confirmation)).toBe(false);
		expect(confirmation.confirmDiscardChanges).toHaveBeenCalledWith(component.formState());
	});

	it("uses the route confirmation boundary for a dirty Pod draft", function routeConfirmation(): void
	{
		const { component, gateway } = setupComponent();
		component.editAutoUpdate(false);
		const confirm = vi.fn(function permit(): boolean { return true; });
		vi.stubGlobal("confirm", confirm);

		expect(_CanDeactivatePodSection(component)).toBe(true);
		expect(confirm).toHaveBeenCalledWith("Discard your unsaved Pod settings changes?");
		vi.unstubAllGlobals();
	});
});
