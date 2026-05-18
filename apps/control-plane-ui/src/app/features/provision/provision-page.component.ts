import { Component, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterModule } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { InputNumberModule } from "primeng/inputnumber";
import { MessageModule } from "primeng/message";
import { CardModule } from "primeng/card";

import { TenantApiService } from "../../core/api/tenants.service";
import type { CreateTenantPayload } from "../../core/models/tenant.models";

/**
 * Provision feature page — form for creating a new OpenCrane tenant.
 * Submits to the control-plane API and redirects to the dashboard on success.
 */
@Component({
  selector: "oc-provision",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    MessageModule,
    CardModule,
  ],
  template: `
    <div class="p-4 max-w-30rem mx-auto">
      <p-card header="Provision New Tenant">
        <form (ngSubmit)="_submit()" #form="ngForm" class="flex flex-column gap-3">
          <div class="flex flex-column gap-1">
            <label for="name" class="font-medium">Tenant ID</label>
            <input
              pInputText
              id="name"
              name="name"
              [(ngModel)]="_form.name"
              placeholder="e.g. acme-engineering"
              required
              pattern="^[a-z0-9-]+$"
            />
            <small class="text-color-secondary">Lowercase letters, numbers, and hyphens only.</small>
          </div>

          <div class="flex flex-column gap-1">
            <label for="displayName" class="font-medium">Display Name</label>
            <input
              pInputText
              id="displayName"
              name="displayName"
              [(ngModel)]="_form.displayName"
              placeholder="ACME Engineering"
              required
            />
          </div>

          <div class="flex flex-column gap-1">
            <label for="email" class="font-medium">Owner Email</label>
            <input
              pInputText
              id="email"
              name="email"
              type="email"
              [(ngModel)]="_form.email"
              placeholder="owner@example.com"
              required
            />
          </div>

          <div class="flex flex-column gap-1">
            <label for="team" class="font-medium">Team (optional)</label>
            <input
              pInputText
              id="team"
              name="team"
              [(ngModel)]="_form.team"
              placeholder="engineering"
            />
          </div>

          <div class="flex flex-column gap-1">
            <label for="budget" class="font-medium">Monthly Budget (USD, optional)</label>
            <p-inputNumber
              id="budget"
              name="budget"
              [(ngModel)]="_form.monthlyBudgetUsd"
              [min]="0"
              [step]="10"
              prefix="$"
              placeholder="200"
            />
          </div>

          @if (_error()) {
            <p-message severity="error" [text]="_error()!" />
          }

          @if (_success()) {
            <p-message severity="success" text="Tenant created! Redirecting..." />
          }

          <div class="flex gap-2 justify-content-end">
            <a routerLink="/dashboard">
              <p-button label="Cancel" severity="secondary" [outlined]="true" />
            </a>
            <p-button
              type="submit"
              label="Create Tenant"
              icon="pi pi-check"
              [loading]="_submitting()"
              [disabled]="form.invalid || _submitting()"
            />
          </div>
        </form>
      </p-card>
    </div>
  `,
})
export class ProvisionPageComponent
{
  /** Injected tenant API service. */
  private readonly _tenantApi = new TenantApiService();

  /** Angular router for post-creation redirect. */
  private readonly _router = new Router();

  /** Form field values bound via ngModel. */
  readonly _form: CreateTenantPayload = {
    name: "",
    displayName: "",
    email: "",
    team: undefined,
    monthlyBudgetUsd: undefined,
  };

  /** Whether the form is currently submitting. */
  readonly _submitting = signal(false);

  /** Error message from a failed API call. */
  readonly _error = signal<string | null>(null);

  /** Whether the submission succeeded. */
  readonly _success = signal(false);

  /**
   * Submit the provision form to the API and redirect on success.
   */
  async _submit(): Promise<void>
  {
    if (this._submitting())
    {
      return;
    }

    this._submitting.set(true);
    this._error.set(null);

    try
    {
      // 1. Call the control-plane API to create the tenant CRD + PostgreSQL row.
      await this._tenantApi.createTenant(this._form);
      this._success.set(true);

      // 2. Redirect to the dashboard after a brief delay so the user sees the success message.
      setTimeout(async () =>
      {
        await this._router.navigate(["/dashboard"]);
      }, 1500);
    }
    catch (err)
    {
      // 3. Surface API errors in the form without losing form state.
      this._error.set(err instanceof Error ? err.message : "Failed to create tenant");
    }
    finally
    {
      this._submitting.set(false);
    }
  }
}
