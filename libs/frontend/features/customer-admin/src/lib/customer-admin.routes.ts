import { Routes } from "@angular/router";

/**
 * Lazy child routes for the customer-admin console feature.
 *
 * Mounted by the operator app under a parent path (e.g. `customer-admin`): the
 * console renders at the empty child path and is lazy-loaded so the feature is
 * only fetched when a customer admin opens it. Access is gated in-component on
 * the session's `customerAdmin` capability for now; a route guard can be layered
 * on at the mount point later.
 */
export const CUSTOMER_ADMIN_ROUTES: Routes =
[
	{
		path: "",
		loadComponent: function loadCustomerAdminPage()
		{
			return import("./customer-admin-page/customer-admin-page.component").then(function pickComponent(m)
			{
				return m.CustomerAdminPageComponent;
			});
		}
	}
];
