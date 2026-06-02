import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";
import { firstValueFrom } from "rxjs";

import type { Group } from "../models/group.model";

/**
 * API service for domain groups and entitlement targets.
 *
 * Groups are control-plane-owned domain membership records that the grant
 * compiler evaluates before producing effective MCP and skill access decisions.
 * The returned shape comes from `@opencrane/contracts` so the UI reads the same
 * contract that the API emits instead of maintaining a parallel frontend-only type.
 */
@Injectable({ providedIn: "root" })
export class GroupsService
{
  private readonly _http = inject(HttpClient);
  private readonly _baseUrl = "/api/groups";

  /** List all groups visible to the current operator as shared control-plane contracts. */
  listGroups$(): Observable<Group[]>
  {
    return this._http.get<Group[]>(this._baseUrl);
  }

  /** Resolve the shared group contracts once for async callers that are not stream-based. */
  async listGroups(): Promise<Group[]>
  {
    return await firstValueFrom(this.listGroups$());
  }
}
