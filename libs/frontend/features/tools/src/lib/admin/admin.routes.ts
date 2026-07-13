import { Routes } from "@angular/router";

/**
 * Admin-only MCP routes (catalogue governance + access policy), mounted by the
 * operator app under `/admin`. Each screen gates itself on the admin capability;
 * the control plane is the real enforcement point.
 */
export const MCP_ADMIN_ROUTES: Routes =
[
	{
		path: "catalogue",
		loadComponent: function loadCatalogueAdmin()
		{
			return import("./catalogue-admin/catalogue-admin.component").then(function pick(m)
			{
				return m.CatalogueAdminComponent;
			});
		}
	},
	{
		path: "access-policy",
		loadComponent: function loadAccessPolicy()
		{
			return import("./access-policy/access-policy.component").then(function pick(m)
			{
				return m.AccessPolicyComponent;
			});
		}
	},
	{
		path: "model-keys",
		loadComponent: function loadModelKeysAdmin()
		{
			return import("./model-keys-admin/model-keys-admin.component").then(function pick(m)
			{
				return m.ModelKeysAdminComponent;
			});
		}
	},
	{
		path: "",
		pathMatch: "full",
		redirectTo: "catalogue"
	}
];
