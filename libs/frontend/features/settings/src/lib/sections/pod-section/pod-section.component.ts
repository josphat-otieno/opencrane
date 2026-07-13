import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource } from "@angular/core";

import { ActiveTenantStore } from "@opencrane/state/gateways";
import { PodIdentity, SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { SaveButtonComponent, SectionHeadingComponent, SettingsRowComponent } from "@opencrane/elements/ui";
import { ToggleFieldComponent } from "../../components/toggle-field/toggle-field.component";
import { _settledValue } from "../../resource.util";

/** Pod & Session settings section. */
@Component({
	selector: "wo-pod-section",
	standalone: true,
	imports: [SectionHeadingComponent, SettingsRowComponent, SaveButtonComponent, ToggleFieldComponent],
	templateUrl: "./pod-section.component.html",
	styleUrl: "./pod-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class PodSectionComponent
{
	/** Active settings data source (mock by default; live OpenCrane when bound). */
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Active pod/tenant name, resolved at the state level (live, or demo pod in mock/offline dev). */
	private readonly _tenant: Signal<string | undefined> = inject(ActiveTenantStore).tenant;

	/** Pod identity/state for the active pod, re-fetched when the tenant changes. */
	private readonly _pod = resource({
		params: (): string | undefined => this._tenant(),
		loader: ({ params }): Promise<PodIdentity> => this._gateway.getPodIdentity(params)
	});

	/** Pod ID shown read-only (the OpenCrane-assigned tenant name). */
	public readonly podId: Signal<string> = computed((): string =>
	{
		return _settledValue(this._pod)?.name ?? "";
	});

	/** Editable display name for the pod. */
	public readonly displayName: Signal<string> = computed((): string =>
	{
		return _settledValue(this._pod)?.displayName ?? "";
	});

	/** Lifecycle phase (e.g. running, provisioning). */
	public readonly phase: Signal<string> = computed((): string =>
	{
		return _settledValue(this._pod)?.phase ?? "";
	});

	/**
	 * Storage stat cells. Static — the pinned opencrane-ui contract exposes no
	 * per-pod storage figures yet (the bucket/quota live in the cluster, not the
	 * Tenant API), so these remain illustrative until an endpoint surfaces them.
	 */
	public readonly storageStats: { label: string; value: string }[] =
	[
		{ label: "Used", value: "2.3 GB" },
		{ label: "Quota", value: "20 GB" },
		{ label: "Encrypted", value: "AES-256" }
	];
}
