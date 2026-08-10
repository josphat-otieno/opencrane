import { Routes } from "@angular/router";

import { WorkspacePageComponent } from "./workspace-page.component.js";

/** Authenticated workspace shell and its currently available child features. */
export const WORKSPACE_ROUTES: Routes =
[
	{
		path: "",
		component: WorkspacePageComponent,
		children:
		[
			{
				path: "",
				pathMatch: "full",
				loadComponent: function loadConversationView()
				{
					return import("@opencrane/features/conversation").then(function pickComponent(m)
					{
						return m.ConversationViewComponent;
					});
				}
			},
			{
				path: "conversation/:threadId",
				loadComponent: function loadConversationDetail()
				{
					return import("@opencrane/features/conversation").then(function pickComponent(m)
					{
						return m.ConversationViewComponent;
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
			},
			{
				path: "settings",
				loadChildren: function loadSettingsRoutes()
				{
					return import("@opencrane/features/settings").then(function pickSettingsRoutes(m)
					{
						return m.SETTINGS_ROUTES;
					});
				}
			}
		]
	}
];
