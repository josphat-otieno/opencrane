import { inject } from "@angular/core";
import { CanActivateFn, Router, UrlTree } from "@angular/router";

import { WelcomeOnboardingService } from "@opencrane/state/onboarding";

/** Redirect authenticated first-time users to onboarding before opening the workspace. */
export const ___FirstRunGuard: CanActivateFn = function ___FirstRunGuard(): boolean | UrlTree
{
	if (inject(WelcomeOnboardingService).completed())
	{
		return true;
	}

	return inject(Router).parseUrl("/welcome");
};
