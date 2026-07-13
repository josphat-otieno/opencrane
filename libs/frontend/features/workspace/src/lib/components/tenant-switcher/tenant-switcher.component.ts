import { ChangeDetectionStrategy, Component, Signal, computed, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { SelectModule } from "primeng/select";

import { SessionStore } from "@opencrane/state/core";

/**
 * Active-tenant switcher for the workspace shell (OPS.3).
 *
 * Lists the tenants the caller can see ({@link SessionStore.tenants}), shows the
 * resolved active tenant ({@link SessionStore.currentTenant}), and switches it via
 * {@link SessionStore.switchTenant} on selection. Presentational only — it holds
 * no transport and never touches HTTP; all state lives in the injected store.
 * Renders nothing until at least two tenants are visible, since a single-tenant
 * caller has nothing to switch between.
 */
@Component({
	selector: "wo-tenant-switcher",
	standalone: true,
	imports: [FormsModule, SelectModule],
	templateUrl: "./tenant-switcher.component.html",
	styleUrl: "./tenant-switcher.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantSwitcherComponent
{
	/** App-wide identity and tenant state. */
	private readonly _session = inject(SessionStore);

	/** Tenant names available to switch between (empty until the resource resolves). */
	public readonly tenantNames: Signal<string[]> = computed(() =>
	{
		const tenants = this._session.tenants.hasValue() ? this._session.tenants.value() : [];
		return tenants.map(function toName(t: { name: string }): string { return t.name; });
	});

	/** Whether more than one tenant exists, so the switcher is worth showing. */
	public readonly hasChoice: Signal<boolean> = computed(() => this.tenantNames().length > 1);

	/** The active tenant name bound to the select, or undefined when unresolved. */
	public readonly activeName: Signal<string | undefined> = computed(() => this._session.currentTenant()?.name);

	/**
	 * Switch the active tenant in response to a select change.
	 *
	 * @param name - The chosen tenant name; ignored when null (select cleared).
	 */
	public onSelect(name: string | null): void
	{
		if (name)
		{
			this._session.switchTenant(name);
		}
	}
}
