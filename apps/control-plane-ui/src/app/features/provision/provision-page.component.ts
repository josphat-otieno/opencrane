import { CommonModule } from "@angular/common";
import { Component, DestroyRef, computed, effect, inject, resource, signal } from "@angular/core";
import { Router, RouterModule } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { MessageModule } from "primeng/message";

import type { CreateTenantPayload } from "../../core/models/create-tenant-payload.model";
import { TenantApiService } from "../../core/api/tenants.service";

const TENANT_NAME_PATTERN = "^[a-z0-9-]+$";
const EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

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

  /** Redirect timeout handle for post-create navigation. */
  private _redirectTimer: ReturnType<typeof setTimeout> | undefined = undefined;

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

  /** Regex pattern used by the template and computed validation for tenant IDs. */
  readonly _tenantNamePattern = TENANT_NAME_PATTERN;

  /** Regex pattern used by the template and computed validation for email addresses. */
  readonly _emailPattern = EMAIL_PATTERN;

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
    const isNameValid = new RegExp(this._tenantNamePattern).test(payload.name);
    const isEmailValid = new RegExp(this._emailPattern).test(payload.email);
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
    // 1. Register one destroy-time cleanup to prevent pending redirect timers from leaking after navigation.
    this._destroyRef.onDestroy(() =>
    {
      if (this._redirectTimer)
      {
        clearTimeout(this._redirectTimer);
      }
    });

    // 2. React to resource transitions so submit requests map to either inline errors or successful redirect flow.
    effect(() =>
    {
      const request = this._createRequest();
      if (!request)
      {
        return;
      }

      // 3. Ignore intermediate loading states because only terminal states should update user-visible submission feedback.
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

        if (this._redirectTimer)
        {
          clearTimeout(this._redirectTimer);
        }

        this._redirectTimer = setTimeout(async () =>
        {
          await this._router.navigate(["/dashboard"]);
        }, 1500);
      }
    });
  }

  /**
   * Update the optional budget signal from a numeric input event payload.
   * @param event - Native input event from the budget field.
   */
  _onBudgetInput(event: Event): void
  {
    const rawValue = (event.target as HTMLInputElement).value;
    this._monthlyBudgetUsd.set(rawValue === "" ? null : +rawValue);
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
