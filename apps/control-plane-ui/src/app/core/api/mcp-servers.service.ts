import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";
import { firstValueFrom } from "rxjs";

import type { McpServer } from "../models/mcp-server.model";

/**
 * API service for MCP server management endpoints.
 *
 * These records are the control-plane source of truth for MCP inventory,
 * grants, credentials, and rollout state. Runtime brokering may be handled by
 * the Obot gateway plane, but this API lists the OpenCrane-managed catalog that
 * Obot consumes rather than querying Obot directly.
 */
@Injectable({ providedIn: "root" })
export class McpServersService
{
  private readonly _http = inject(HttpClient);
  private readonly _baseUrl = "/api/mcp-servers";

  /** List the shared MCP server contracts registered with the control-plane. */
  listMcpServers$(): Observable<McpServer[]>
  {
    return this._http.get<McpServer[]>(this._baseUrl);
  }

  /** Resolve the shared MCP server contracts once for async callers that are not stream-based. */
  async listMcpServers(): Promise<McpServer[]>
  {
    return await firstValueFrom(this.listMcpServers$());
  }
}
