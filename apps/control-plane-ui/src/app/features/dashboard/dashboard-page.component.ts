import { Component, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { MessageModule } from "primeng/message";

import { TenantApiService } from "../../core/api/tenants.service";
import { TenantCardComponent } from "../../shared/components/tenant-card/tenant-card.component";
import type { TenantSummary } from "../../core/models/tenant.models";

/**
 * Dashboard feature page — lists all tenants the current user has access to,
 * showing health status, phase, and quick actions.
 */
@Component({
  selector: "oc-dashboard",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    ProgressSpinnerModule,
    MessageModule,
    TenantCardComponent,
  ],
  template: `
    <div class="p-4">
      <div class="flex justify-content-between align-items-center mb-4">
        <h1 class="text-2xl font-bold m-0">Dashboard</h1>
        <a routerLink="/provision">
          <p-button label="New Tenant" icon="pi pi-plus" />
        </a>
      </div>

      @if (_loading()) {
        <div class="flex justify-content-center p-6">
          <p-progressSpinner />
        </div>
      } @else if (_error()) {
        <p-message severity="error" [text]="_error()!" />
      } @else if (_tenants().length === 0) {
        <div class="text-center p-6 text-color-secondary">
          <p>No tenants found. <a routerLink="/provision">Create your first tenant.</a></p>
        </div>
      } @else {
        <div class="grid">
          @for (tenant of _tenants(); track tenant.name) {
            <div class="col-12 md:col-6 lg:col-4">
              <oc-tenant-card [tenant]="tenant" />
            </div>
          }
        </div>
        <p class="text-color-secondary text-sm mt-3">
          {{ _tenants().length }} tenant{{ _tenants().length === 1 ? "" : "s" }} total —
          {{ _runningCount() }} running
        </p>
      }
    </div>
  `,
})
export class DashboardPageComponent implements OnInit
{
  /** Injected tenant API service. */
  private readonly _tenantApi = new TenantApiService();

  /** Reactive tenant list. */
  readonly _tenants = signal<TenantSummary[]>([]);

  /** Loading state flag. */
  readonly _loading = signal(true);

  /** Error message when the API call fails. */
  readonly _error = signal<string | null>(null);

  /**
   * Load tenants from the API on component initialisation.
   */
  async ngOnInit(): Promise<void>
  {
    try
    {
      // 1. Fetch the tenant list — rendered immediately into the card grid.
      const tenants = await this._tenantApi.listTenants();
      this._tenants.set(tenants);
    }
    catch (err)
    {
      // 2. Capture the error for display rather than crashing the component.
      this._error.set(err instanceof Error ? err.message : "Failed to load tenants");
    }
    finally
    {
      // 3. Always clear the loading spinner regardless of success or failure.
      this._loading.set(false);
    }
  }

  /**
   * Count tenants currently in the Running phase.
   */
  _runningCount(): number
  {
    return this._tenants().filter(function _isRunning(t) { return t.phase === "Running"; }).length;
  }
}
