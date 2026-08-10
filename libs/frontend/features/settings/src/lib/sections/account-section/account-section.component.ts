import { ChangeDetectionStrategy, Component, Signal, computed, inject, signal } from "@angular/core";

import { AvatarCircleComponent, SectionHeadingComponent, SettingsRowComponent } from "@opencrane/elements/ui";
import { SessionStore } from "@opencrane/state/core";

/** Personal account settings section backed by the authenticated session. */
@Component({
	selector: "wo-account-section",
	standalone: true,
	imports: [AvatarCircleComponent, SectionHeadingComponent, SettingsRowComponent],
	templateUrl: "./account-section.component.html",
	styleUrl: "./account-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSectionComponent
{
	/** Signed-in session source for profile, capability, and logout state. */
	private readonly _session = inject(SessionStore);

	/** Whether the logout request is currently unresolved. */
	public readonly logoutPending = signal<boolean>(false);

	/** Retryable logout failure state. */
	public readonly logoutError = signal<boolean>(false);

	/** Display name read from the current authenticated session. */
	public readonly displayName: Signal<string> = computed((): string => this._session.displayName() ?? "Signed-in user");

	/** Email read from the current authenticated session. */
	public readonly email: Signal<string> = computed((): string => this._session.user()?.email ?? "Not provided");

	/** Stable subject read from the current authenticated session. */
	public readonly subject: Signal<string> = computed((): string => this._session.user()?.sub ?? "Not available");

	/** Organisation claim read from the current authenticated session. */
	public readonly workspace: Signal<string> = computed((): string => this._session.user()?.clusterTenant ?? "Not assigned");

	/** User-facing role label derived from fail-closed capability flags. */
	public readonly role: Signal<string> = computed((): string =>
	{
		const capabilities = this._session.capabilities();
		if (capabilities.isPlatformOperator) return "Platform operator";
		if (capabilities.customerAdmin) return "Organisation admin";
		if (this._session.authenticated()) return "Member";
		return "Signed out";
	});

	/** Avatar initials computed from the display name or email. */
	public readonly avatarInitials: Signal<string> = computed((): string =>
	{
		return _InitialsFor(this.displayName());
	});

	/** Log out through the shared session boundary. */
	public async logout(): Promise<void>
	{
		if (this.logoutPending()) return;
		this.logoutPending.set(true);
		this.logoutError.set(false);
		try
		{
			await this._session.logout();
		}
		catch
		{
			this.logoutError.set(true);
		}
		finally
		{
			this.logoutPending.set(false);
		}
	}
}

/** Build compact initials for the profile avatar. */
function _InitialsFor(name: string): string
{
	const trimmed = name.trim();
	if (!trimmed) return "OC";
	const parts = trimmed.split(/\s+/);
	if (parts.length > 1) return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
	return trimmed.substring(0, 2).toUpperCase();
}
