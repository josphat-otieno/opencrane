// @vitest-environment jsdom

import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ModelProvider, PROVIDER_KEY_GATEWAY } from "@opencrane/state/provider-key/adapter";
import { MockProviderKeyGateway } from "@opencrane/state/gateways/testing";

import { LlmProvidersSectionComponent } from "./llm-providers-section.component.js";

/** Create a Models component backed by the narrow provider-key gateway. */
function _component(): LlmProvidersSectionComponent
{
	TestBed.configureTestingModule({
		providers: [{ provide: PROVIDER_KEY_GATEWAY, useClass: MockProviderKeyGateway }]
	});
	return TestBed.runInInjectionContext(function create(): LlmProvidersSectionComponent
	{
		return new LlmProvidersSectionComponent();
	});
}

/** Allow resource loaders queued during component construction to settle. */
function _settleResource(): Promise<void>
{
	return new Promise(function resolveSettled(resolve): void
	{
		setTimeout(resolve, 0);
	});
}

beforeAll(function prepareAngularProviders(): void
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
});

afterEach(function resetAngularProviders(): void
{
	TestBed.resetTestingModule();
});

afterAll(function releaseAngularProviders(): void
{
	TestBed.resetTestEnvironment();
});

describe("LlmProvidersSectionComponent", function llmProvidersSectionSuite(): void
{
	it("uses provider-key statuses for the supported provider rows", async function providerRows(): Promise<void>
	{
		const component = _component();
		await _settleResource();

		expect(component.providers().map(function name(row): string { return row.name; })).toEqual([
			"OpenAI", "Anthropic", "Google Gemini", "Mistral", "DeepSeek", "Zhipu GLM"
		]);
		expect(component.providers().every(function inactive(row): boolean { return !row.configured; })).toBe(true);
	});

	it("stores and removes provider keys through the provider-key gateway", async function keyLifecycle(): Promise<void>
	{
		const component = _component();
		await _settleResource();
		component.openAddPage();
		component.selectProvider(ModelProvider.Anthropic);
		component.keyDraft.set("transient credential");
		await component.saveKey();
		await component.providersResource.reload();
		await _settleResource();

		expect(component.keyDraft()).toBe("");
		expect(component.addPageOpen()).toBe(false);
		expect(component.providers().find(function anthropic(row): boolean { return row.provider === ModelProvider.Anthropic; })?.configured).toBe(true);

		const target = component.providers().find(function anthropic(row): boolean { return row.provider === ModelProvider.Anthropic; });
		if (!target) throw new Error("Anthropic provider row was not rendered");
		component.requestRemove(target, { currentTarget: {} } as unknown as Event, {} as HTMLElement);
		await component.confirmRemove();
		await component.providersResource.reload();
		await _settleResource();

		expect(component.removeTarget()).toBeNull();
		expect(component.providers().find(function anthropic(row): boolean { return row.provider === ModelProvider.Anthropic; })?.configured).toBe(false);
	});

	it("keeps model-routing controls unavailable until they are contract-backed", function routingUnavailable(): void
	{
		const component = _component();
		component.addCategory();

		expect(component.routeCategories()).toHaveLength(3);
		expect(component.routeCategories().every(function readonly(row): boolean { return row.model === "Not configurable yet"; })).toBe(true);
		expect(component.feedback()).toEqual({ kind: "error", message: "Model routing settings are not available yet." });
	});
});
