import { readFileSync } from "node:fs";

import { Injector, runInInjectionContext } from "@angular/core";

import { SessionStore } from "@opencrane/state/core";

import { ConversationViewComponent } from "../conversation-view/conversation-view.component";

const _conversationTemplate = readFileSync("src/lib/conversation-view/conversation-view.component.html", "utf8");

describe("ConversationViewComponent", () =>
{
	function _component(displayName: string | null): ConversationViewComponent
	{
		const injector = Injector.create({
			providers: [
				{
					provide: SessionStore,
					useValue: { displayName: function _displayName() { return displayName; } }
				}
			]
		});

		return runInInjectionContext(injector, () => new ConversationViewComponent());
	}

	it("uses the authenticated display name in the greeting", () =>
	{
		expect(_component("Ada Lovelace").displayName()).toBe("Ada Lovelace");
		expect(_component(null).displayName()).toBe("there");
	});

	it("presents unavailable commands as disabled controls", () =>
	{
		const template = _conversationTemplate;

		expect(template).not.toContain("sendRequested");
		expect(template).not.toContain("copyLink");
		expect(template).not.toContain("shareRequested");
		expect(template.match(/disabled/g)?.length).toBe(3);
		expect(template).toContain("Messaging is not available yet");
	});

	it("composes display-safe messages without a transport dependency", () =>
	{
		const componentSource = readFileSync("src/lib/conversation-view/conversation-view.component.ts", "utf8");
		const template = _conversationTemplate;

		expect(componentSource).toContain("readonly messages = input<readonly ConversationMessageView[]>([])");
		expect(template).toContain("@for (message of messages(); track message.id)");
		expect(template).toContain("<wo-conversation-message [message]=\"message\" />");
		expect(componentSource).not.toContain("HttpClient");
		expect(componentSource).not.toContain("WebSocket");
	});

	it("supports opaque thread routes and read-only companion panels", () =>
	{
		const componentSource = readFileSync("src/lib/conversation-view/conversation-view.component.ts", "utf8");
		const panelTemplate = readFileSync("src/lib/support-panel/conversation-support-panel.component.html", "utf8").toLowerCase();

		expect(componentSource).toContain("readonly threadId = input<string>()");
		expect(_conversationTemplate).toContain("Canonical conversation replay is not connected yet.");
		expect(panelTemplate).toContain("sharing is not available yet");
		expect(panelTemplate).not.toContain("copy session link");
		expect(panelTemplate).not.toContain("pod");
	});

	it("keeps retired OpenClaw concepts out of visible conversation copy", () =>
	{
		const template = _conversationTemplate.toLowerCase();

		expect(template).not.toContain("openclaw");
		expect(template).not.toContain("session");
		expect(template).not.toContain("pod token");
		expect(template).not.toContain("gateway");
	});
});
