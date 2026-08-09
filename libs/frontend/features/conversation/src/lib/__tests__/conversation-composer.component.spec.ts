import { readFileSync } from "node:fs";

import { Injector, runInInjectionContext } from "@angular/core";

import { ConversationComposerComponent } from "../conversation-composer/conversation-composer.component";

describe("ConversationComposerComponent", function _Suite()
{
	it("keeps blank prompts from submitting and exposes an accessible composer", function _KeepsBlankPromptsDisabled()
	{
		const injector = Injector.create({ providers: [] });
		const component = runInInjectionContext(injector, function _Create(): ConversationComposerComponent
		{
			return new ConversationComposerComponent();
		});
		const template = readFileSync("src/lib/conversation-composer/conversation-composer.component.html", "utf8");

		expect(component.canSubmit()).toBe(false);
		expect(template).toContain("aria-label=\"Conversation message\"");
		expect(template).toContain("(keydown)=\"handleKeydown($event)\"");
		expect(template).toContain("[disabled]=\"!canSubmit()\"");
	});

	it("keeps unavailable submission visible without retired product language", function _KeepsVisibleUnavailableCopy()
	{
		const template = readFileSync("src/lib/conversation-composer/conversation-composer.component.html", "utf8").toLowerCase();
		const retiredProduct = "open" + "claw";

		expect(template).toContain("disabledreason()");
		expect(template).not.toContain(retiredProduct);
		expect(template).not.toContain("session");
		expect(template).not.toContain("pod");
	});
});
