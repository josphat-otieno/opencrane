import { Component, computed, inject, signal } from "@angular/core";
import { rxResource } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { MessageModule } from "primeng/message";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";

import { TenantApiService } from "../../core/api/tenants.service";
import { TenantPhase } from "../../core/models/tenant-phase.enum";
import { _GetTenantPhaseSeverity, type TenantPhaseTagSeverity } from "../../core/models/tenant-phase.utils";

/**
 * Admin Panel feature page — lists all tenants in a sortable, filterable table
 * with phase badges and direct action links for operators.
 */
@Component({
  selector: "oc-admin",
  standalone: true,
  imports: [
    RouterLink,
    ButtonModule,
    TableModule,
    TagModule,
    ProgressSpinnerModule,
    MessageModule,
    InputTextModule,
  ],
  templateUrl: "./admin-panel-page.component.html",
})
export class AdminPanelPageComponent
{
  /** Injected tenant API service. */
  private readonly _tenantApi = inject(TenantApiService);

  /** Resource-backed tenant list for admin operations. */
  private readonly _tenantsResource = rxResource({
    stream: () => this._tenantApi.listTenants$(),
    defaultValue: [],
  });

  /** Current filter string for table filtering. */
  readonly _filter = signal("");

  /** Full unfiltered tenant list. */
  readonly _tenants = computed(() => this._tenantsResource.value());

  /** Page loading state. */
  readonly _loading = computed(() => this._tenantsResource.isLoading());

  /** Error message. */
  readonly _error = computed(() => this._tenantsResource.error()?.message ?? null);

  /**
   * Return tenants filtered by the current filter string.
   * Matches against name, displayName, team, and email fields.
   */
  readonly _filteredTenants = computed(() =>
  {
    const query = this._filter().trim().toLowerCase();
    if (!query)
    {
      return this._tenants();
    }

    return this._tenants().filter(t =>
    {
      return t.name.toLowerCase().includes(query)
        || t.displayName.toLowerCase().includes(query)
        || (t.team ?? "").toLowerCase().includes(query)
        || t.email.toLowerCase().includes(query);
    });
  });

  /** Count tenants in the Running phase. */
  readonly _runningCount = computed(() =>
  {
    return this._tenants().filter(t => t.phase === TenantPhase.Running).length;
  });

  /** Count tenants in the Suspended phase. */
  readonly _suspendedCount = computed(() =>
  {
    return this._tenants().filter(t => t.phase === TenantPhase.Suspended).length;
  });

  /** Count tenants in the Error phase. */
  readonly _errorCount = computed(() =>
  {
    return this._tenants().filter(t => t.phase === TenantPhase.Error).length;
  });

  /**
   * Map a lifecycle phase string to a PrimeNG Tag severity.
   * @param phase - Tenant lifecycle phase string.
   */
  _phaseSeverity(phase: string): TenantPhaseTagSeverity
  {
    return _GetTenantPhaseSeverity(phase);
  }

  /**
   * Update the table filter signal from a text input event.
   * @param event - Native input event from the filter field.
   */
  _onFilterInput(event: Event): void
  {
    this._filter.set((event.target as HTMLInputElement).value);
  }
}
