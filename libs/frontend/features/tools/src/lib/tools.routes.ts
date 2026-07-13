import { Routes } from "@angular/router";

/**
 * Routes for the user-facing Tools area, mounted by the workspace shell under
 * `/tools` so each view is deep-linkable.
 *
 * - `""` → My Tools (the user's installed servers + connection status).
 * - `"catalogue"` → the browse-and-install catalogue of entitled servers.
 */
export const TOOLS_ROUTES: Routes =
[
	{
		path: "",
		loadComponent: function loadMyTools()
		{
			return import("./my-tools/my-tools.component").then(function pick(m)
			{
				return m.MyToolsComponent;
			});
		}
	},
	{
		path: "catalogue",
		loadComponent: function loadCatalogue()
		{
			return import("./catalogue/catalogue.component").then(function pick(m)
			{
				return m.CatalogueComponent;
			});
		}
	}
];
