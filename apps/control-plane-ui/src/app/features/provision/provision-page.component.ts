import { CommonModule } from "@angular/common";
import { Component, DestroyRef, computed, effect, inject, resource, signal } from "@angular/core";
import { Router, RouterModule } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { MessageModule } from "primeng/message";

import type { CreateTenantPayload } from "../../core/models/create-tenant-payload.model";
import { TenantApiService } from "../../core/api/tenants.service";

interface CreateTenantRequestState
{
  id: number;
  payload: CreateTenantPayload;
}

/**
 * Provision feature page — signal-driven form for creating a new OpenCrane tenant.
 * Submits to the control-plane API and redirects to the dashboard on success.
 */
@Component({
  selector: "oc-provision",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    CardModule,
  ],
  templateUrl: "./provision-page.component.html",
})
export class ProvisionPageComponent
{
  /** Injected tenant API service. */
  private readonly _tenantApi = inject(TenantApiService);

  /** Angular router for post-creation redirect. */
  private readonly _router = inject(Router);

  /** DestroyRef for cleaning up the redirect timeout if the component is destroyed early. */
  private readonly _destroyRef = inject(DestroyRef);

  /** Monotonic submission ID to track unique create requests. */
  private _nextSubmissionId = 1;

  /** Last successful submission ID, used to avoid duplicate success handling in the effect. */
  private _lastHandledSuccessId = 0;

  /** Pending create request state. */
  private readonly _createRequest = signal<CreateTenantRequestState | null>(null);

  /** Tenant ID field. */
  readonly _name = signal("");

  /** Display name field. */
  readonly _displayName = signal("");

  /** Owner email field. */
  readonly _email = signal("");

  /** Optional team field. */
  readonly _team = signal("");

  /** Optional monthly budget field. */
  readonly _monthlyBudgetUsd = signal<number | null>(null);

  /** Error message from a failed API call. */
  readonly _error = signal<string | null>(null);

  /** Whether the submission succeeded. */
  readonly _success = signal(false);

  /** Computed request payload from the signal-form state. */
  readonly _payload = computed<CreateTenantPayload>(() =>
  {
    return {
      name: this._name().trim(),
      displayName: this._displayName().trim(),
      email: this._email().trim(),
      team: this._team().trim() || undefined,
      monthlyBudgetUsd: this._monthlyBudgetUsd() ?? undefined,
    };
  });

  /** Whether the current signal-form values satisfy client-side validity checks. */
  readonly _canSubmit = computed(() =>
  {
    const payload = this._payload();
    const isNameValid = /^[a-z0-9-]+$/.test(payload.name);
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email);
    const isBudgetValid = payload.monthlyBudgetUsd === undefined || payload.monthlyBudgetUsd >= 0;

    return payload.name.length > 0
      && payload.displayName.length > 0
      && payload.email.length > 0
      && isNameValid
      && isEmailValid
      && isBudgetValid;
  });

  /** Resource-backed tenant creation request. */
  private readonly _createTenantResource = resource<number | null, CreateTenantRequestState | null>({
    params: this._createRequest,
    loader: async ({ params }) =>
    {
      if (!params)
      {
        return null;
      }

      await this._tenantApi.createTenant(params.payload);
      return params.id;
    },
    defaultValue: null as number | null,
  });

  /** Whether a create request is currently in flight. */
  readonly _submitting = computed(() => this._createTenantResource.isLoading());

  constructor()
  {
    effect(() =>
    {
      const request = this._createRequest();
      if (!request)
      {
        return;
      }

      if (this._createTenantResource.isLoading())
      {
        return;
      }

      const error = this._createTenantResource.error();
      if (error)
      {
        this._error.set(error.message);
        this._success.set(false);
        this._createRequest.set(null);
        return;
      }

      const completedSubmissionId = this._createTenantResource.value();
      if (completedSubmissionId === request.id && completedSubmissionId !== this._lastHandledSuccessId)
      {
        this._lastHandledSuccessId = completedSubmissionId;
        this._success.set(true);
        this._createRequest.set(null);

        let redirectTimer: ReturnType<typeof setTimeout> | undefined = undefined;
        this._destroyRef.onDestroy(function _cancelRedirect()
        {
          if (redirectTimer)
          {
            clearTimeout(redirectTimer);
          }
        });

        redirectTimer = setTimeout(async () =>
        {
          await this._router.navigate(["/dashboard"]);
        }, 1500);
      }
    });
  }

  /**
   * Submit the provision form to the API and redirect on success.
   */
  _submit(): void
  {
    if (!this._canSubmit() || this._submitting())
    {
      return;
    }

    this._error.set(null);
    this._success.set(false);
    this._createRequest.set({
      id: this._nextSubmissionId,
      payload: this._payload(),
    });
    this._nextSubmissionId += 1;
  }
}
