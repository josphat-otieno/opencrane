import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource } from "@angular/core";

import { ActiveTenantStore } from "@opencrane/state/gateways";
import { SaveButtonComponent, SectionHeadingComponent, SettingsRowComponent } from "@opencrane/elements/ui";
import { AccountProfile, SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ToggleFieldComponent } from "../../components/toggle-field/toggle-field.component";
import { _settledValue } from "../../resource.util";

/** Account settings section. */
@Component({
	selector: "wo-account-section",
	standalone: true,
	imports: [SectionHeadingComponent, SettingsRowComponent, SaveButtonComponent, ToggleFieldComponent],
	templateUrl: "./account-section.component.html",
	styleUrl: "./account-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSectionComponent
{
	/** Active settings data source (mock by default; live OpenCrane when bound). */
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Active pod/tenant name, resolved at the state level (live, or demo pod in mock/offline dev). */
	private readonly _tenant: Signal<string | undefined> = inject(ActiveTenantStore).tenant;

	/**
	 * Account profile for the active pod, re-fetched whenever the active tenant
	 * changes. Stays idle (no request) until a tenant resolves.
	 */
	private readonly _profile = resource({
		params: (): string | undefined => this._tenant(),
		loader: ({ params }): Promise<AccountProfile> => this._gateway.getAccountProfile(params)
	});

	/** Full name shown in the editable field. */
	public readonly fullName: Signal<string> = computed((): string =>
	{
		return _settledValue(this._profile)?.fullName ?? "";
	});

	/** Org-managed email shown read-only. */
	public readonly email: Signal<string> = computed((): string =>
	{
		return _settledValue(this._profile)?.email ?? "";
	});

	/** Department the pod belongs to, used to mark the selected option. */
	public readonly department: Signal<string> = computed((): string =>
	{
		return _settledValue(this._profile)?.department ?? "";
	});

	/** Department options for the select. */
	public readonly departments: string[] = ["Product", "Engineering", "Marketing", "Finance", "Design"];

	/** Notification preference labels. */
	public readonly notificationPreferences: string[] =
	[
		"Skill promotion updates",
		"Budget alerts",
		"Awareness contract rollouts",
		"Harvest completions",
		"Policy changes"
	];
}
