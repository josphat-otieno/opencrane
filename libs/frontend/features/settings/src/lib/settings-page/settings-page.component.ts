import { ChangeDetectionStrategy, Component, ElementRef, Signal, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { filter, map } from "rxjs";

import { PERSONAL_SETTINGS_NAVIGATION, WORKSPACE_SETTINGS_NAVIGATION, _SettingsScopeFromUrl } from "../settings-navigation.js";
import { SettingsNavigationItem, SettingsScope } from "../settings-navigation.types.js";

/** Settings view: section navigation plus active routed section content. */
@Component({
	selector: "wo-settings-page",
	standalone: true,
	imports: [RouterLink, RouterLinkActive, RouterOutlet],
	templateUrl: "./settings-page.component.html",
	styleUrl: "./settings-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPageComponent
{
	/** Typed scope values exposed to the route-driven template. */
	public readonly scopes = SettingsScope;

	/** Router providing the canonical settings scope and section state. */
	private readonly _router = inject(Router);

	/** Settings host used to find the persistent routed-content focus target. */
	private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

	/** Active scope derived from completed router navigations. */
	public readonly activeScope: Signal<SettingsScope> = toSignal(this._router.events.pipe(
		filter(function isNavigationEnd(event): event is NavigationEnd
		{
			return event instanceof NavigationEnd;
		}),
		map(function scopeFromNavigation(event): SettingsScope
		{
			return _SettingsScopeFromUrl(event.urlAfterRedirects);
		})
	), { initialValue: _SettingsScopeFromUrl(this._router.url) });

	/** Navigation items for the active route scope. */
	public readonly navigation: Signal<readonly SettingsNavigationItem[]> = computed((): readonly SettingsNavigationItem[] =>
	{
		return this.activeScope() === SettingsScope.Personal ? PERSONAL_SETTINGS_NAVIGATION : WORKSPACE_SETTINGS_NAVIGATION;
	});

	/** Activate a settings scope at its canonical default destination. */
	public async selectScope(scope: SettingsScope): Promise<void>
	{
		// 1. Scope destination - each scope lands on the first contract-backed section.
		const destination = scope === SettingsScope.Personal ? "/settings/personal/account" : "/settings/workspace/models";

		// 2. Default no-op - preserve routed state and focus when already at the destination.
		if (this._router.url === destination) return;

		// 3. Routed activation - let section-owned guards cancel before local state is destroyed.
		const navigated = await this._router.navigateByUrl(destination);

		// 4. Focus transfer - move keyboard users only after routed content changes.
		if (navigated) this._host.nativeElement.querySelector<HTMLElement>(".wo-settings__content")?.focus();
	}
}
