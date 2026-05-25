import { Component, computed, inject } from "@angular/core";
import { rxResource } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { MessageModule } from "primeng/message";
import { ProgressSpinnerModule } from "primeng/progressspinner";

import { TenantApiService } from "../../core/api/tenants.service";
import { TenantPhase } from "../../core/models/tenant-phase.enum";
import { TenantCardComponent } from "../../shared/components/tenant-card/tenant-card.component";

/**
 * Dashboard feature page — lists all tenants the current user has access to,
 * showing health status, phase, and quick actions.
 */
@Component({
  selector: "oc-dashboard",
  standalone: true,
  imports: [
    RouterLink,
    ButtonModule,
    ProgressSpinnerModule,
    MessageModule,
    TenantCardComponent,
  ],
  templateUrl: "./dashboard-page.component.html",
})
export class DashboardPageComponent
{
  /** Injected tenant API service. */
  private readonly _tenantApi = inject(TenantApiService);

  /** Resource-backed tenant list that reloads on demand and tracks loading/error state. */
  private readonly _tenantsResource = rxResource({
    stream: () => this._tenantApi.listTenants$(),
    defaultValue: [],
  });

  /** Reactive tenant list. */
  readonly _tenants = computed(() => this._tenantsResource.value());

  /** Loading state flag. */
  readonly _loading = computed(() => this._tenantsResource.isLoading());

  /** Error message when the API call fails. */
  readonly _error = computed(() => this._tenantsResource.error()?.message ?? null);

  /**
   * Count tenants currently in the Running phase.
   */
  readonly _runningCount = computed(() =>
  {
    return this._tenants().filter(t => t.phase === TenantPhase.Running).length;
  });
}
