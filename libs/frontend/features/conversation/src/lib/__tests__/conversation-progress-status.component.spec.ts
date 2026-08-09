import { readFileSync } from "node:fs";

import { Injector, runInInjectionContext } from "@angular/core";

import { ConversationProgressStates } from "@opencrane/state/conversation/adapter";

import { ConversationProgressStatusComponent } from "../components/progress-status/conversation-progress-status.component";

describe("ConversationProgressStatusComponent", function _Suite()
{
	it("maps progress states to OpenCrane-visible labels", function _MapsProgressLabels()
	{
		const injector = Injector.create({ providers: [] });
		const component = runInInjectionContext(injector, function _create(): ConversationProgressStatusComponent
		{
			return new ConversationProgressStatusComponent();
		});

		expect(component.state()).toBe(ConversationProgressStates.Idle);
		expect(component.visible()).toBe(false);
	});

	it("keeps retry and lifecycle copy out of transport vocabulary", function _KeepsVisibleCopyClean()
	{
		const template = readFileSync("src/lib/components/progress-status/conversation-progress-status.component.html", "utf8").toLowerCase();
		const source = readFileSync("src/lib/components/progress-status/conversation-progress-status.component.ts", "utf8").toLowerCase();
		const visibleCopy = `${template}\n${source}`;
		const retiredProduct = "open" + "claw";

		expect(visibleCopy).toContain("retry");
		expect(visibleCopy).toContain("waiting for opencrane");
		expect(visibleCopy).not.toContain(retiredProduct);
		expect(visibleCopy).not.toContain("socket");
		expect(visibleCopy).not.toContain("pod");
		expect(visibleCopy).not.toContain("session");
	});
});
