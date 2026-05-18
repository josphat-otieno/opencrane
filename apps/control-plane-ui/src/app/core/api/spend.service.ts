import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";

import type { TenantSpend } from "../models/tenant-spend.model";

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
