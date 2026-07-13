import { ChangeDetectionStrategy, Component, effect, inject, signal } from "@angular/core";
import { NavigationEnd, Router, RouterOutlet } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter } from "rxjs";

import { SidebarComponent } from "./components/sidebar/sidebar.component";
import { NotificationPanelComponent } from "@opencrane/features/notifications";

/** Root workspace shell: sidebar + routed session/settings outlet + popovers. */
@Component({
	selector: "wo-workspace-page",
	standalone: true,
	imports: [SidebarComponent, NotificationPanelComponent, RouterOutlet],
	templateUrl: "./workspace-page.component.html",
	styleUrl: "./workspace-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspacePageComponent
{
	/** Router, observed to dismiss the notification popover on navigation. */
	private readonly _router = inject(Router);

	/** Whether the notification popover is open. */
	public readonly notificationsOpen = signal<boolean>(false);

	/** Latest completed navigation, used to auto-dismiss the popover. */
	private readonly _navigated = toSignal(this._router.events.pipe(filter(function isNavEnd(e): e is NavigationEnd { return e instanceof NavigationEnd; })));

	public constructor()
	{
		// Selecting a session or opening settings navigates the outlet; close the
		// notification popover whenever a navigation completes (former selectThread
		// / openSettings behaviour, now driven by the router).
		const notificationsOpen = this.notificationsOpen;
		effect(() =>
		{
			this._navigated();
			notificationsOpen.set(false);
		});
	}
}
