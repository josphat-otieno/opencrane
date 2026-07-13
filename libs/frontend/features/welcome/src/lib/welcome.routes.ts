import { Routes } from "@angular/router";

/**
 * Routes for the operator app's first-run onboarding.
 *
 * The flow lives at the feature root (`""`); the host app mounts these under
 * whatever path it chooses (e.g. `/welcome`) and decides — via the
 * `WelcomeOnboardingService.completed` flag — whether to redirect a first-run
 * user here. Lazy-loads the page so it is only fetched when entered.
 */
export const WELCOME_ROUTES: Routes =
[
	{
		path: "",
		loadComponent: function loadWelcomePage()
		{
			return import("./welcome-page/welcome-page.component").then(function pickComponent(m)
			{
				return m.WelcomePageComponent;
			});
		}
	}
];
