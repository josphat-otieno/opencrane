import { Routes } from "@angular/router";

import { provideWoA2ui } from "@opencrane/elements/a2ui";

import { WorkspacePageComponent } from "./workspace-page.component";

/**
 * Routes for the operator workspace.
 *
 * {@link WorkspacePageComponent} is the persistent shell (sidebar + popovers)
 * and hosts a `<router-outlet>`; the session and settings pages render into it,
 * so each view is deep-linkable and browser back/forward switches between them.
 * The host app mounts these at the root path behind the first-run guard.
 */
export const WORKSPACE_ROUTES: Routes =
[
	{
		path: "",
		component: WorkspacePageComponent,
		// In-process A2UI rendering is scoped to the workspace so @a2ui + the markdown
		// pipeline load with this lazy chunk, not the initial bundle.
		providers: [...provideWoA2ui()],
		children:
		[
			{
				// Root of the workspace opens a blank "new session" composer — no
				// thread is selected and no history loads. Sending the first message
				// mints a session id and deep-links to `session/:id` (see
				// SessionPageComponent.startSession).
				path: "",
				pathMatch: "full",
				loadComponent: function loadNewSessionPage()
				{
					return import("./session-page/session-page.component").then(function pickComponent(m)
					{
						return m.SessionPageComponent;
					});
				}
			},
			{
				path: "session/:id",
				loadComponent: function loadSessionPage()
				{
					return import("./session-page/session-page.component").then(function pickComponent(m)
					{
						return m.SessionPageComponent;
					});
				}
			},
			{
				path: "settings",
				loadComponent: function loadSettingsPage()
				{
					return import("@opencrane/features/settings").then(function pickComponent(m)
					{
						return m.SettingsPageComponent;
					});
				}
			},
			{
				path: "tools",
				loadChildren: function loadToolsRoutes()
				{
					return import("@opencrane/features/tools").then(function pickToolsRoutes(m)
					{
						return m.TOOLS_ROUTES;
					});
				}
			}
		]
	}
];
