import { Injector, runInInjectionContext } from "@angular/core";
import { Router, UrlTree } from "@angular/router";

import { WelcomeOnboardingService } from "@opencrane/state/onboarding";

import { ___FirstRunGuard } from "./first-run.guard";

describe("___FirstRunGuard", () =>
{
	function _run(completed: boolean): { result: boolean | UrlTree; parseUrl: ReturnType<typeof vi.fn> }
	{
		const destination = {} as UrlTree;
		const parseUrl = vi.fn().mockReturnValue(destination);
		const injector = Injector.create({
			providers: [
				{ provide: WelcomeOnboardingService, useValue: { completed: function _completed() { return completed; } } },
				{ provide: Router, useValue: { parseUrl } }
			]
		});

		const result = runInInjectionContext(injector, () => ___FirstRunGuard({} as never, {} as never));
		if (result instanceof Promise) throw new Error("first-run guard must remain synchronous");
		return { result: result as boolean | UrlTree, parseUrl };
	}

	it("redirects an incomplete first run to welcome", () =>
	{
		const { result, parseUrl } = _run(false);

		expect(result).not.toBe(true);
		expect(parseUrl).toHaveBeenCalledWith("/welcome");
	});

	it("opens the workspace after onboarding completes", () =>
	{
		const { result, parseUrl } = _run(true);

		expect(result).toBe(true);
		expect(parseUrl).not.toHaveBeenCalled();
	});
});
