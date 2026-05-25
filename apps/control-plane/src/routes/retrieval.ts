import * as k8s from "@kubernetes/client-node";
import { Router } from "express";
import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";

import { _HashQuery } from "../domain/retrieval/retrieval-hash.util.js";
import { _CheckRetrievalPolicyDenied, _ResolveTenantPolicyName } from "../domain/retrieval/retrieval-policy.logic.js";
import { DatasetScope } from "../domain/retrieval/retrieval.types.js";
import type { RetrievalErrorResponse, RetrievalQueryRequest, RetrievalQueryResponse } from "../domain/retrieval/retrieval.types.js";

/** Excerpt character limit — avoids returning full large documents to the caller. */
const CONTENT_EXCERPT_LIMIT = 500;

/** Default and maximum page size for retrieval queries. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Cognee HTTP timeout defaults (milliseconds). */
const DEFAULT_COGNEE_TIMEOUT_MS = 5000;
const DEFAULT_COGNEE_HEALTH_TIMEOUT_MS = 3000;

/**
 * Creates an Express router for the org knowledge retrieval API.
 *
 * The retrieval route enforces AccessPolicy-driven allow/deny before returning
 * any documents from the org index. Every query is recorded in the audit log
 * regardless of the authorization outcome.
 *
 * Tenant linkage:
 * - The request `tenantName` is resolved from PostgreSQL to confirm tenant existence and runtime phase.
 * - The same tenant name is then used to resolve its Tenant CR policyRef in Kubernetes.
 * - AccessPolicy mcpServers allow/deny for that tenant governs whether retrieval is permitted.
 *
 * @param customApi - Kubernetes Custom Objects API client for policy resolution.
 * @param prisma    - Prisma ORM client for org_documents and audit_log access.
 * @returns Configured Express Router mounted at /api/retrieval.
 */
export function retrievalRouter(customApi: k8s.CustomObjectsApi, prisma: PrismaClient): Router
{
  const router = Router();
  const namespace = process.env.NAMESPACE ?? "default";

  /**
   * Query the org knowledge index with AccessPolicy-driven authorization.
   * Returns RBAC-filtered documents or a 403 when policy denies access.
   */
  router.post("/query", async function _postRetrievalQuery(req, res)
  {
    const body = req.body as RetrievalQueryRequest;

    // 1. Validate required fields — fail fast before any DB or K8s calls.
    if (!body?.query || !body?.tenantName)
    {
      const errorBody: RetrievalErrorResponse = {
        code: "UNAUTHORIZED",
        error: "query and tenantName are required",
      };
      res.status(400).json(errorBody);
      return;
    }

    const { query, tenantName, teamScope, limit: rawLimit } = body;
    const limit = Math.min(rawLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const datasetScope = _ResolveDatasetScope(body.datasetScope);
    const queriedAt = new Date().toISOString();

    if (!datasetScope)
    {
      const errorBody: RetrievalErrorResponse = {
        code: "UNAUTHORIZED",
        error: "datasetScope must be one of: org, team, project, personal",
      };
      res.status(400).json(errorBody);
      return;
    }

    const datasetId = _ResolveDatasetId(datasetScope, body.datasetId);

    if (!datasetId)
    {
      const errorBody: RetrievalErrorResponse = {
        code: "UNAUTHORIZED",
        error: "datasetId is required",
      };
      res.status(400).json(errorBody);
      return;
    }

    // 2. Resolve the tenant from PostgreSQL to verify it exists.
    const tenant = await prisma.tenant.findUnique({ where: { name: tenantName } });
    if (!tenant)
    {
      const errorBody: RetrievalErrorResponse = {
        code: "TENANT_NOT_FOUND",
        error: `Tenant '${tenantName}' not found`,
      };
      res.status(404).json(errorBody);
      return;
    }

    // 3. Load the resolved AccessPolicy for the tenant from the Kubernetes API.
    //    The policy drives the allow/deny decision for this retrieval request.
    const policyName = tenant.phase !== "Running"
      ? null
      : await _ResolveTenantPolicyName(customApi, tenantName, namespace);

    const policyDeniesRetrieval = await _CheckRetrievalPolicyDenied(
      customApi,
      policyName,
      namespace,
    );

    // 4. Audit the query regardless of the authorization outcome so all retrieval
    //    attempts are traceable, not just successful ones.
    await prisma.auditEntry.create({
      data: {
        tenant: tenantName,
        action: policyDeniesRetrieval ? "RetrievalDenied" : "RetrievalAllowed",
        resource: `Tenant/${tenantName}`,
        message: `Retrieval query '${query.slice(0, 80)}' by tenant ${tenantName} — ${policyDeniesRetrieval ? "denied" : "allowed"}`,
        metadata: {
          queryHash: _HashQuery(query),
          policyRef: policyName ?? "none",
          teamScope: teamScope ?? null,
          datasetScope,
          datasetId,
          deniedBy: policyDeniesRetrieval ? "policy" : null,
        },
      },
    });

    // 5. Return 403 with explicit authorization error when policy denies retrieval.
    if (policyDeniesRetrieval)
    {
      const errorBody: RetrievalErrorResponse = {
        code: "POLICY_DENIED",
        error: `Retrieval access denied by policy '${policyName ?? "default-deny"}'`,
      };
      res.status(403).json(errorBody);
      return;
    }

    // 6. Execute retrieval against Cognee. PostgreSQL retrieval has been retired.
    let results: RetrievalQueryResponse["results"];
    try
    {
      results = await _QueryCognee({
        query,
        tenantName,
        teamScope,
        datasetScope,
        datasetId,
        limit,
        headers: _BuildCogneeHeaders(req, tenantName),
      });
    }
    catch (error)
    {
      const message = error instanceof Error ? error.message : "Cognee retrieval query failed";
      const errorBody: RetrievalErrorResponse = {
        code: "INTERNAL_ERROR",
        error: message,
      };
      res.status(503).json(errorBody);
      return;
    }

    const response: RetrievalQueryResponse = {
      results,
      count: results.length,
      authOutcome: "allowed",
      queriedAt,
      datasetScope,
      datasetId,
    };

    res.json(response);
  });

  /**
   * Health check for the retrieval subsystem. Returns document counts and
   * connectivity status without any auth enforcement.
   */
  router.get("/health", async function _getRetrievalHealth(req, res)
  {
    try
    {
      const timeoutMs = _ReadPositiveIntEnv("COGNEE_HEALTH_TIMEOUT_MS", DEFAULT_COGNEE_HEALTH_TIMEOUT_MS);
      const healthResponse = await fetch(_BuildCogneeUrl("/health"), {
        method: "GET",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!healthResponse.ok)
      {
        res.status(503).json({
          status: "error",
          backend: "cognee",
          error: `Cognee health probe failed with status ${healthResponse.status}`,
        });
        return;
      }

      res.json({
        status: "ok",
        backend: "cognee",
      });
    }
    catch (error)
    {
      const message = error instanceof Error ? error.message : "Cognee health probe failed";
      res.status(503).json({
        status: "error",
        backend: "cognee",
        error: message,
      });
    }
  });

  return router;
}

/**
 * Resolve dataset ID defaults based on the requested scope.
 * @param datasetScope - Requested dataset scope.
 * @param rawDatasetId - Optional dataset ID from request body.
 */
function _ResolveDatasetId(datasetScope: DatasetScope, rawDatasetId: unknown): string | null
{
  const datasetId = typeof rawDatasetId === "string" ? rawDatasetId.trim() : "";
  if (datasetId.length > 0)
  {
    return datasetId;
  }

  if (datasetScope === DatasetScope.Org)
  {
    return "default";
  }

  return null;
}

/**
 * Resolve and validate dataset scope from an untrusted request value.
 * @param rawScope - Raw dataset scope from the request body.
 */
function _ResolveDatasetScope(rawScope: unknown): DatasetScope | null
{
  if (rawScope === undefined)
  {
    return DatasetScope.Org;
  }

  if (
    rawScope === DatasetScope.Org
    || rawScope === DatasetScope.Team
    || rawScope === DatasetScope.Project
    || rawScope === DatasetScope.Personal
  )
  {
    return rawScope;
  }

  return null;
}

interface CogneeQueryInput
{
  query: string;
  tenantName: string;
  teamScope?: string;
  datasetScope: DatasetScope;
  datasetId: string;
  limit: number;
  headers: Record<string, string>;
}

/**
 * Query Cognee as the single retrieval runtime.
 * @param input - Normalized retrieval request.
 */
async function _QueryCognee(input: CogneeQueryInput): Promise<RetrievalQueryResponse["results"]>
{
  const timeoutMs = _ReadPositiveIntEnv("COGNEE_QUERY_TIMEOUT_MS", DEFAULT_COGNEE_TIMEOUT_MS);
  const response = await fetch(_BuildCogneeUrl("/v1/retrieval/query"), {
    method: "POST",
    headers: input.headers,
    body: JSON.stringify({
      query: input.query,
      tenantName: input.tenantName,
      teamScope: input.teamScope ?? null,
      datasetScope: input.datasetScope,
      datasetId: input.datasetId,
      limit: input.limit,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok)
  {
    throw new Error(`Cognee retrieval query failed with status ${response.status}`);
  }

  const payload = await response.json() as unknown;
  return _NormalizeCogneeResults(payload);
}

/**
 * Normalize a Cognee response into the public retrieval response shape.
 * @param payload - Raw Cognee query response.
 */
function _NormalizeCogneeResults(payload: unknown): RetrievalQueryResponse["results"]
{
  if (typeof payload !== "object" || payload === null)
  {
    return [];
  }

  const payloadRecord = payload as Record<string, unknown>;
  const rawResults = _PickArray(payloadRecord, ["results", "items", "documents", "matches"]);
  if (!rawResults)
  {
    return [];
  }

  return rawResults.map(function _toResult(entry, index)
  {
    const record = typeof entry === "object" && entry !== null
      ? entry as Record<string, unknown>
      : {};
    const id = _PickString(record, ["id"]) ?? `cognee-${index + 1}`;
    const sourceId = _PickString(record, ["sourceId", "source_id", "documentId", "document_id"]) ?? id;
    const content = _PickString(record, ["contentExcerpt", "content_excerpt", "excerpt", "content", "text"]) ?? "";
    const ingestedAt = _PickString(record, ["ingestedAt", "ingested_at", "timestamp"]) ?? new Date().toISOString();

    return {
      id,
      source: _PickString(record, ["source"]) ?? "cognee",
      sourceId,
      owner: _PickString(record, ["owner", "tenantName", "tenant"]) ?? "unknown",
      teamScope: _PickString(record, ["teamScope", "team_scope"]) ?? undefined,
      sensitivityTags: _PickStringArray(record, ["sensitivityTags", "sensitivity_tags", "tags"]),
      title: _PickString(record, ["title"]) ?? undefined,
      contentExcerpt: content.slice(0, CONTENT_EXCERPT_LIMIT),
      ingestedAt,
    };
  });
}

/**
 * Resolve Cognee URL and append the requested path.
 * @param path - Path suffix beginning with "/".
 */
function _BuildCogneeUrl(path: string): string
{
  const endpoint = process.env.COGNEE_ENDPOINT?.trim();
  if (!endpoint)
  {
    throw new Error("COGNEE_ENDPOINT is required for retrieval runtime");
  }

  return `${endpoint.replace(/\/+$/, "")}${path}`;
}

/**
 * Build HTTP headers for Cognee requests.
 */
function _BuildCogneeHeaders(req: Request, tenantName: string): Record<string, string>
{
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.length > 0)
  {
    headers.authorization = authorization;
  }

  const userId = _ReadFirstHeaderValue(req.headers["x-user-id"])
    ?? req.session?.authUser?.email
    ?? req.session?.authUser?.sub;

  if (userId)
  {
    headers["x-cognee-user-id"] = userId;
  }

  headers["x-cognee-tenant-id"] = tenantName;
  headers["x-cognee-session-id"] = _BuildCogneeSessionId(tenantName, userId);
  headers["x-opencrane-retrieval-source"] = "control-plane";

  return headers;
}

/**
 * Build a deterministic Cognee session identifier for this retrieval request.
 * @param tenantName - Tenant name from retrieval query.
 * @param userId - Resolved caller user identifier.
 */
function _BuildCogneeSessionId(tenantName: string, userId: string | undefined): string
{
  const tenantPart = tenantName.trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
  const userPart = (userId ?? "anonymous").trim().replace(/[^a-zA-Z0-9@._-]+/g, "_");
  return `session_${tenantPart}_${userPart}`;
}

/**
 * Resolve a single header value when the incoming value may be a string array.
 * @param value - Raw Express header value.
 */
function _ReadFirstHeaderValue(value: string | string[] | undefined): string | undefined
{
  if (Array.isArray(value))
  {
    return value.find(function _isNonEmpty(entry)
    {
      return entry.trim().length > 0;
    });
  }

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Parse a positive integer env var with fallback.
 * @param key - Environment variable name.
 * @param fallback - Fallback value when unset/invalid.
 */
function _ReadPositiveIntEnv(key: string, fallback: number): number
{
  const raw = process.env[key];
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * Pick the first string value from a set of candidate keys.
 * @param record - Source record.
 * @param keys - Candidate keys in priority order.
 */
function _PickString(record: Record<string, unknown>, keys: string[]): string | null
{
  for (const key of keys)
  {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0)
    {
      return value;
    }
  }

  return null;
}

/**
 * Pick and normalize a string-array field from a set of candidate keys.
 * @param record - Source record.
 * @param keys - Candidate keys in priority order.
 */
function _PickStringArray(record: Record<string, unknown>, keys: string[]): string[]
{
  for (const key of keys)
  {
    const value = record[key];
    if (Array.isArray(value))
    {
      return value.filter(function _isString(entry): entry is string
      {
        return typeof entry === "string" && entry.length > 0;
      });
    }
  }

  return [];
}

/**
 * Pick the first array field from a set of candidate keys.
 * @param record - Source record.
 * @param keys - Candidate keys in priority order.
 */
function _PickArray(record: Record<string, unknown>, keys: string[]): unknown[] | null
{
  for (const key of keys)
  {
    const value = record[key];
    if (Array.isArray(value))
    {
      return value;
    }
  }

  return null;
}
