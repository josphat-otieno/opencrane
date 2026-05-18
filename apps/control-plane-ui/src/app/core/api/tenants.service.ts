import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";

import type { CreateTenantPayload } from "../models/create-tenant-payload.model";
import { _ParseTenantPhase } from "../models/tenant-phase.utils";
import type { TenantSummary } from "../models/tenant-summary.model";

interface TenantSummaryApiResponse extends Omit<TenantSummary, "phase">
{
  phase: string;
}

/**
 * API service for tenant lifecycle operations in the control-plane UI.
 * All HTTP requests go through this service — never issue requests from components directly.
 */
@Injectable({ providedIn: "root" })
export class TenantApiService
{
  private readonly _http = inject(HttpClient);
  private readonly _baseUrl = "/api/tenants";

  /**
   * List all tenants from the control-plane.
   */
  async listTenants(): Promise<TenantSummary[]>
  {
    const rows = await firstValueFrom(this._http.get<TenantSummaryApiResponse[]>(this._baseUrl));
    return rows.map(row => this._toTenantSummary(row));
  }

  /**
   * Get a single tenant by name.
   * @param name - Tenant unique identifier.
   */
  async getTenant(name: string): Promise<TenantSummary>
  {
    const row = await firstValueFrom(this._http.get<TenantSummaryApiResponse>(`${this._baseUrl}/${encodeURIComponent(name)}`));
    return this._toTenantSummary(row);
  }

  /**
   * Create a new tenant.
   * @param payload - Tenant creation payload.
   */
  async createTenant(payload: CreateTenantPayload): Promise<{ name: string; status: string }>
  {
    return await firstValueFrom(
      this._http.post<{ name: string; status: string }>(this._baseUrl, payload),
    );
  }

  /**
   * Suspend a running tenant (scales the deployment to zero).
   * @param name - Tenant unique identifier.
   */
  async suspendTenant(name: string): Promise<void>
  {
    await this._runTenantAction(name, "suspend");
  }

  /**
   * Resume a suspended tenant.
   * @param name - Tenant unique identifier.
   */
  async resumeTenant(name: string): Promise<void>
  {
    await this._runTenantAction(name, "resume");
  }

  /**
   * Delete a tenant and its managed Kubernetes resources.
   * @param name - Tenant unique identifier.
   */
  async deleteTenant(name: string): Promise<void>
  {
    await firstValueFrom(this._http.delete(this._tenantUrl(name)));
  }

  /**
   * Build the canonical tenant URL using a URL-safe tenant name.
   * @param name - Tenant unique identifier.
   */
  private _tenantUrl(name: string): string
  {
    return `${this._baseUrl}/${encodeURIComponent(name)}`;
  }

  /**
   * Execute a standard tenant lifecycle action (suspend/resume).
   * @param name - Tenant unique identifier.
   * @param action - Lifecycle action path segment.
   */
  private async _runTenantAction(name: string, action: "suspend" | "resume"): Promise<void>
  {
    await firstValueFrom(this._http.post(`${this._tenantUrl(name)}/${action}`, {}));
  }

  /**
   * Normalize API tenant payloads to strict UI model types.
   * Phase parsing is required because backend payloads are untyped strings, while
   * the UI relies on enum-backed phase checks for consistent rendering and actions.
   * @param row - Raw tenant payload from API.
   */
  private _toTenantSummary(row: TenantSummaryApiResponse): TenantSummary
  {
    return {
      ...row,
      phase: _ParseTenantPhase(row.phase),
    };
  }
}
