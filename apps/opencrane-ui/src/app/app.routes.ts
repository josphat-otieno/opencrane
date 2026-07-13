import { Routes } from "@angular/router";

import { ___FirstRunGuard } from "./first-run.guard";
import { ___OperatorAccessGuard } from "./operator-access.guard";

/** Top-level route table; feature pages are lazy-loaded route containers. */
export const APP_ROUTES: Routes =
[
	{
		// Public sign-in landing. No access guard — this is the destination the
		// guard sends anonymous visitors to.
		path: "login",
		loadComponent: function loadLoginPage()
		{
			return import("./login/login-page.component").then(function pickLoginPage(m)
			{
				return m.LoginPageComponent;
			});
		}
	},
	{
		// Terminal screen for authenticated users with no UserTenant in this org.
		// No access guard — the guard is what routes users here.
		path: "no-tenant",
		loadComponent: function loadNoTenantPage()
		{
			return import("./no-tenant/no-tenant-page.component").then(function pickNoTenantPage(m)
			{
				return m.NoTenantPageComponent;
			});
		}
	},
	{
		// First-run onboarding (OPS.1). Reached directly or via the first-run guard.
		path: "welcome",
		canActivate: [___OperatorAccessGuard],
		loadChildren: function loadWelcomeRoutes()
		{
			return import("@opencrane/features/welcome").then(function pickWelcomeRoutes(m)
			{
				return m.WELCOME_ROUTES;
			});
		}
	},
	{
		// Customer-admin console (OPS.4) — gated in-component on the customerAdmin capability.
		path: "customer-admin",
		canActivate: [___OperatorAccessGuard],
		loadChildren: function loadCustomerAdminRoutes()
		{
			return import("@opencrane/features/customer-admin").then(function pickCustomerAdminRoutes(m)
			{
				return m.CUSTOMER_ADMIN_ROUTES;
			});
		}
	},
	{
		// MCP admin console (catalogue governance + access policy). Each screen
		// gates in-component on the customerAdmin capability.
		path: "admin",
		canActivate: [___OperatorAccessGuard],
		loadChildren: function loadMcpAdminRoutes()
		{
			return import("@opencrane/features/tools").then(function pickMcpAdminRoutes(m)
			{
				return m.MCP_ADMIN_ROUTES;
			});
		}
	},
	{
		// Workspace shell (sidebar + popovers) hosting deep-linkable child routes
		// (session / settings) in its router-outlet. Gated by the access guard
		// (auth + tenant present), then the first-run guard.
		path: "",
		canActivate: [___OperatorAccessGuard, ___FirstRunGuard],
		loadChildren: function loadWorkspaceRoutes()
		{
			return import("@opencrane/features/workspace").then(function pickWorkspaceRoutes(m)
			{
				return m.WORKSPACE_ROUTES;
			});
		}
	},
	{
		path: "**",
		redirectTo: ""
	}
];
