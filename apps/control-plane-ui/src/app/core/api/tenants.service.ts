import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";

import type { CreateTenantPayload, TenantSpend, TenantSummary } from "../models/tenant.models";

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
    return await firstValueFrom(this._http.get<TenantSummary[]>(this._baseUrl));
  }

  /**
   * Get a single tenant by name.
   * @param name - Tenant unique identifier.
   */
  async getTenant(name: string): Promise<TenantSummary>
  {
    return await firstValueFrom(this._http.get<TenantSummary>(`${this._baseUrl}/${encodeURIComponent(name)}`));
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
    await firstValueFrom(this._http.post(`${this._baseUrl}/${encodeURIComponent(name)}/suspend`, {}));
  }

  /**
   * Resume a suspended tenant.
   * @param name - Tenant unique identifier.
   */
  async resumeTenant(name: string): Promise<void>
  {
    await firstValueFrom(this._http.post(`${this._baseUrl}/${encodeURIComponent(name)}/resume`, {}));
  }

  /**
   * Delete a tenant and its managed Kubernetes resources.
   * @param name - Tenant unique identifier.
   */
  async deleteTenant(name: string): Promise<void>
  {
    await firstValueFrom(this._http.delete(`${this._baseUrl}/${encodeURIComponent(name)}`));
  }
}

/**
 * API service for tenant spend and budget data.
 */
@Injectable({ providedIn: "root" })
export class SpendApiService
{
  private readonly _http = inject(HttpClient);
  private readonly _baseUrl = "/api/ai-budget";

  /**
   * Get spend summary for a specific tenant.
   * @param tenantName - Tenant unique identifier.
   */
  async getTenantSpend(tenantName: string): Promise<TenantSpend>
  {
    return await firstValueFrom(
      this._http.get<TenantSpend>(`${this._baseUrl}/${encodeURIComponent(tenantName)}/spend`),
    );
  }
}
