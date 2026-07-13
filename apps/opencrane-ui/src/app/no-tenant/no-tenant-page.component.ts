import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { Button } from "primeng/button";
import { Card } from "primeng/card";

import { SessionStore } from "@opencrane/state/core";

/**
 * Terminal screen for an authenticated user who has no UserTenant in this
 * operator's org (the per-org workspace can serve them nothing).
 *
 * Displayed only via the operator-access guard's redirect, so the page is
 * deliberately stateless — it does not poll for a tenant to appear. The
 * "Log out" button hands the session back to the opencrane-ui logout flow,
 * which clears the cookie and bounces the browser back to the entry page.
 */
@Component({
	selector: "wo-no-tenant-page",
	standalone: true,
	imports: [Card, Button],
	templateUrl: "./no-tenant-page.component.html",
	styleUrl: "./no-tenant-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NoTenantPageComponent
{
	/** App-wide identity/session state — used to trigger logout. */
	private readonly _session = inject(SessionStore);

	/** Sign the user out of the opencrane-ui session and return to `/`. */
	public logout(): void
	{
		void this._session.logout();
	}
}
