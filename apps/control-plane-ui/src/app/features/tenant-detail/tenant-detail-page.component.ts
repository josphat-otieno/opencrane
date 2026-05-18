import { Component, OnInit, signal } from "@angular/core";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { CommonModule } from "@angular/common";
import { ButtonModule } from "primeng/button";
import { TagModule } from "primeng/tag";
import { CardModule } from "primeng/card";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { MessageModule } from "primeng/message";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { ConfirmationService } from "primeng/api";

import { TenantApiService, SpendApiService } from "../../core/api/tenants.service";
import { SpendChartComponent } from "../../shared/components/spend-chart/spend-chart.component";
import type { TenantSpend, TenantSummary } from "../../core/models/tenant.models";

/**
 * Tenant Detail feature page — shows full tenant info, spend chart,
 * and provides suspend/resume/delete actions.
 */
@Component({
  selector: "oc-tenant-detail",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    TagModule,
    CardModule,
    ProgressSpinnerModule,
    MessageModule,
    ConfirmDialogModule,
    SpendChartComponent,
  ],
  providers: [ConfirmationService],
  template: `
    <p-confirmDialog />
    <div class="p-4">
      <div class="flex align-items-center gap-2 mb-4">
        <a routerLink="/dashboard">
          <p-button icon="pi pi-arrow-left" [text]="true" severity="secondary" />
        </a>
        <h1 class="text-2xl font-bold m-0">
          {{ _tenant()?.displayName ?? _tenantName }}
        </h1>
        @if (_tenant()) {
          <p-tag
            [value]="_tenant()!.phase"
            [severity]="_phaseSeverity(_tenant()!.phase)"
          />
        }
      </div>

      @if (_loading()) {
        <p-progressSpinner />
      } @else if (_error()) {
        <p-message severity="error" [text]="_error()!" />
      } @else if (_tenant()) {
        <div class="grid">
          <div class="col-12 md:col-6">
            <p-card header="Details" styleClass="h-full">
              <div class="flex flex-column gap-2">
                <div class="flex justify-content-between">
                  <span class="text-color-secondary">Name</span>
                  <span class="font-medium">{{ _tenant()!.name }}</span>
                </div>
                <div class="flex justify-content-between">
                  <span class="text-color-secondary">Email</span>
                  <span>{{ _tenant()!.email }}</span>
                </div>
                @if (_tenant()!.team) {
                  <div class="flex justify-content-between">
                    <span class="text-color-secondary">Team</span>
                    <span>{{ _tenant()!.team }}</span>
                  </div>
                }
                @if (_tenant()!.ingressHost) {
                  <div class="flex justify-content-between">
                    <span class="text-color-secondary">URL</span>
                    <a [href]="'https://' + _tenant()!.ingressHost" target="_blank" rel="noopener">
                      {{ _tenant()!.ingressHost }}
                    </a>
                  </div>
                }
                @if (_tenant()!.createdAt) {
                  <div class="flex justify-content-between">
                    <span class="text-color-secondary">Created</span>
                    <span>{{ _tenant()!.createdAt | date:'mediumDate' }}</span>
                  </div>
                }
              </div>
            </p-card>
          </div>

          <div class="col-12 md:col-6">
            <p-card header="Budget & Spend" styleClass="h-full">
              @if (_spend()) {
                <oc-spend-chart [spend]="_spend()!" />
              } @else {
                <p class="text-color-secondary text-sm">Spend data unavailable.</p>
              }
            </p-card>
          </div>
        </div>

        <div class="flex gap-2 mt-4">
          @if (_tenant()!.phase === 'Running') {
            <p-button
              label="Suspend"
              icon="pi pi-pause"
              severity="warn"
              [outlined]="true"
              [loading]="_actionLoading()"
              (click)="_suspend()"
            />
          }
          @if (_tenant()!.phase === 'Suspended') {
            <p-button
              label="Resume"
              icon="pi pi-play"
              severity="success"
              [outlined]="true"
              [loading]="_actionLoading()"
              (click)="_resume()"
            />
          }
          <p-button
            label="Delete"
            icon="pi pi-trash"
            severity="danger"
            [outlined]="true"
            [loading]="_actionLoading()"
            (click)="_confirmDelete()"
          />
        </div>
      }
    </div>
  `,
})
export class TenantDetailPageComponent implements OnInit
{
  /** Injected tenant API service. */
  private readonly _tenantApi = new TenantApiService();

  /** Injected spend API service. */
  private readonly _spendApi = new SpendApiService();

  /** Confirmation dialog service. */
  private readonly _confirmationService = new ConfirmationService();

  /** Angular router for navigation after delete. */
  private readonly _router = new Router();

  /** Tenant name from the route parameter. */
  _tenantName = "";

  /** Loaded tenant data. */
  readonly _tenant = signal<TenantSummary | null>(null);

  /** Loaded spend data. */
  readonly _spend = signal<TenantSpend | null>(null);

  /** Page loading state. */
  readonly _loading = signal(true);

  /** Action (suspend/resume/delete) in progress. */
  readonly _actionLoading = signal(false);

  /** Error message. */
  readonly _error = signal<string | null>(null);

  /** Route for accessing the tenant name parameter. */
  private readonly _route = new ActivatedRoute();

  /**
   * Load tenant and spend data on component initialisation.
   */
  async ngOnInit(): Promise<void>
  {
    this._tenantName = this._route.snapshot.paramMap.get("name") ?? "";

    try
    {
      // 1. Load tenant details and spend data in parallel to reduce perceived latency.
      const [tenant, spend] = await Promise.allSettled([
        this._tenantApi.getTenant(this._tenantName),
        this._spendApi.getTenantSpend(this._tenantName),
      ]);

      if (tenant.status === "fulfilled")
      {
        this._tenant.set(tenant.value);
      }
      else
      {
        this._error.set("Failed to load tenant details");
      }

      // 2. Spend is optional — a missing spend endpoint is not a fatal error.
      if (spend.status === "fulfilled")
      {
        this._spend.set(spend.value);
      }
    }
    finally
    {
      // 3. Always clear the loading spinner.
      this._loading.set(false);
    }
  }

  /**
   * Map a lifecycle phase string to a PrimeNG Tag severity.
   * @param phase - Tenant lifecycle phase string.
   */
  _phaseSeverity(phase: string): "success" | "info" | "warn" | "danger" | "secondary"
  {
    const map: Record<string, "success" | "info" | "warn" | "danger" | "secondary"> = {
      Running: "success",
      Pending: "info",
      Suspended: "warn",
      Error: "danger",
    };

    return map[phase] ?? "secondary";
  }

  /**
   * Suspend the tenant by calling the suspend API endpoint.
   */
  async _suspend(): Promise<void>
  {
    this._actionLoading.set(true);
    try
    {
      await this._tenantApi.suspendTenant(this._tenantName);
      await this._refreshTenant();
    }
    finally
    {
      this._actionLoading.set(false);
    }
  }

  /**
   * Resume a suspended tenant.
   */
  async _resume(): Promise<void>
  {
    this._actionLoading.set(true);
    try
    {
      await this._tenantApi.resumeTenant(this._tenantName);
      await this._refreshTenant();
    }
    finally
    {
      this._actionLoading.set(false);
    }
  }

  /**
   * Show a confirmation dialog before deleting the tenant.
   */
  _confirmDelete(): void
  {
    this._confirmationService.confirm({
      message: `Are you sure you want to delete tenant "${this._tenantName}"? This cannot be undone.`,
      header: "Confirm Delete",
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Delete",
      rejectLabel: "Cancel",
      accept: async () =>
      {
        await this._delete();
      },
    });
  }

  /**
   * Reload the tenant data from the API.
   */
  private async _refreshTenant(): Promise<void>
  {
    const tenant = await this._tenantApi.getTenant(this._tenantName);
    this._tenant.set(tenant);
  }

  /**
   * Delete the tenant and redirect to the dashboard.
   */
  private async _delete(): Promise<void>
  {
    this._actionLoading.set(true);
    try
    {
      await this._tenantApi.deleteTenant(this._tenantName);
      await this._router.navigate(["/dashboard"]);
    }
    finally
    {
      this._actionLoading.set(false);
    }
  }
}
