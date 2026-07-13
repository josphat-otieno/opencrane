import { inject } from "@angular/core";
import { CanActivateFn, Router, UrlTree } from "@angular/router";
import { WelcomeOnboardingService } from "@opencrane/state/onboarding";

/**
 * Set once the first-run redirect has fired this session. Guarantees the guard
 * redirects to the welcome flow at most once per app load, so a browser where
 * `localStorage` is unavailable (the welcome service then reports "not
 * completed") cannot get trapped in a workspace↔welcome redirect loop.
 */
let _redirectedThisLoad = false;

/**
 * First-run guard for the workspace route: redirects to `/welcome` when the
 * user has not completed onboarding. Fires at most once per app load (see
 * `_redirectedThisLoad`); after the welcome flow marks completion, or after that
 * single redirect, the workspace activates normally.
 */
export const ___FirstRunGuard: CanActivateFn = function ___FirstRunGuard(): boolean | UrlTree
{
	if (_redirectedThisLoad)
	{
		return true;
	}
	if (inject(WelcomeOnboardingService).completed())
	{
		return true;
	}
	_redirectedThisLoad = true;
	return inject(Router).parseUrl("/welcome");
};
