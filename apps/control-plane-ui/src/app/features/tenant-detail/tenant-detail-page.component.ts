import { DatePipe } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { rxResource, toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { catchError, map, of } from "rxjs";
import { ConfirmationService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { MessageModule } from "primeng/message";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { TagModule } from "primeng/tag";

import { SpendApiService } from "../../core/api/spend.service";
import { TenantApiService } from "../../core/api/tenants.service";
import { TenantPhase } from "../../core/models/tenant-phase.enum";
import { _GetTenantPhaseSeverity, type TenantPhaseTagSeverity } from "../../core/models/tenant-phase.utils";
import type { TenantSpend } from "../../core/models/tenant-spend.model";
import type { TenantSummary } from "../../core/models/tenant-summary.model";
import { SpendChartComponent } from "../../shared/components/spend-chart/spend-chart.component";

/**
 * Tenant Detail feature page — shows full tenant info, spend chart,
 * and provides suspend/resume/delete actions.
 */
@Component({
  selector: "oc-tenant-detail",
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    ButtonModule,
    TagModule,
    CardModule,
    ProgressSpinnerModule,
    MessageModule,
    ConfirmDialogModule,
    SpendChartComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: "./tenant-detail-page.component.html",
})
export class TenantDetailPageComponent
{
  /** Injected tenant API service. */
  private readonly _tenantApi = inject(TenantApiService);

  /** Injected spend API service. */
  private readonly _spendApi = inject(SpendApiService);

  /** Confirmation dialog service. */
  private readonly _confirmationService = inject(ConfirmationService);

  /** Angular router for navigation after delete. */
  private readonly _router = inject(Router);

  /** Route for accessing the tenant name parameter. */
  private readonly _route = inject(ActivatedRoute);

  /** Action (suspend/resume/delete) in progress. */
  readonly _actionLoading = signal(false);

  /** Tenant lifecycle enum for template comparisons. */
  readonly _tenantPhase = TenantPhase;

  /** Tenant name from the route parameter. */
  readonly _tenantName = toSignal(
    this._route.paramMap.pipe(map(params => params.get("name") ?? "")),
    { initialValue: "" },
  );

  /** Resource-backed tenant detail request. */
  private readonly _tenantResource = rxResource<TenantSummary | null, string>({
    params: this._tenantName,
    stream: ({ params }) =>
    {
      if (!params)
      {
        return of(null);
      }

      return this._tenantApi.getTenant$(params);
    },
    defaultValue: null,
  });

  /** Resource-backed spend lookup. Spend is optional and failure-tolerant for this page. */
  private readonly _spendResource = rxResource<TenantSpend | null, string>({
    params: this._tenantName,
    stream: ({ params }) =>
    {
      if (!params)
      {
        return of(null);
      }

      return this._spendApi.getTenantSpend$(params).pipe(catchError(() => of(null)));
    },
    defaultValue: null,
  });

  /** Loaded tenant data. */
  readonly _tenant = computed(() => this._tenantResource.value());

  /** Loaded spend data. */
  readonly _spend = computed(() => this._spendResource.value());

  /** Page loading state. */
  readonly _loading = computed(() => this._tenantResource.isLoading());

  /** Error message. */
  readonly _error = computed(() => this._tenantResource.error()?.message ?? null);

  /** Whether the tenant can be suspended. */
  readonly _canSuspend = computed(() => this._tenant()?.phase === TenantPhase.Running);

  /** Whether the tenant can be resumed. */
  readonly _canResume = computed(() => this._tenant()?.phase === TenantPhase.Suspended);

  /**
   * Map a lifecycle phase string to a PrimeNG Tag severity.
   * @param phase - Tenant lifecycle phase string.
   */
  _phaseSeverity(phase: string): TenantPhaseTagSeverity
  {
    return _GetTenantPhaseSeverity(phase);
  }

  /**
   * Suspend the tenant by calling the suspend API endpoint.
   */
  async _suspend(): Promise<void>
  {
    this._actionLoading.set(true);
    try
    {
      await this._tenantApi.suspendTenant(this._tenantName());
      this._tenantResource.reload();
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
      await this._tenantApi.resumeTenant(this._tenantName());
      this._tenantResource.reload();
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
      message: `Are you sure you want to delete tenant "${this._tenantName()}"? This cannot be undone.`,
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
   * Delete the tenant and redirect to the dashboard.
   */
  private async _delete(): Promise<void>
  {
    this._actionLoading.set(true);
    try
    {
      await this._tenantApi.deleteTenant(this._tenantName());
      await this._router.navigate(["/dashboard"]);
    }
    finally
    {
      this._actionLoading.set(false);
    }
  }
}
