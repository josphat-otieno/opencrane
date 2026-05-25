import * as k8s from "@kubernetes/client-node";
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

import { _HashQuery } from "../domain/retrieval/retrieval-hash.util.js";
import { _CheckRetrievalPolicyDenied, _ResolveTenantPolicyName } from "../domain/retrieval/retrieval-policy.logic.js";
import type { RetrievalErrorResponse, RetrievalQueryRequest, RetrievalQueryResponse } from "../domain/retrieval/retrieval.types.js";

/** Excerpt character limit — avoids returning full large documents to the caller. */
const CONTENT_EXCERPT_LIMIT = 500;

/** Default and maximum page size for retrieval queries. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
    const queriedAt = new Date().toISOString();

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

    // 6. Execute the filtered query — apply team scope when the caller requests it
    //    so tenants can narrow results to their own team's documents.
    const docs = await prisma.orgDocument.findMany({
      where: {
        AND: [
          {
            OR: [
              { content: { contains: query, mode: "insensitive" } },
              { title: { contains: query, mode: "insensitive" } },
            ],
          },
          ...(teamScope ? [{ teamScope }] : []),
        ],
      },
      orderBy: { ingestedAt: "desc" },
      take: limit,
    });

    // 7. Map database rows to the public response shape, truncating large content
    //    to the configured excerpt limit to avoid oversized payloads.
    const results = docs.map(function _toResult(doc)
    {
      return {
        id: doc.id,
        source: doc.source,
        sourceId: doc.sourceId,
        owner: doc.owner,
        teamScope: doc.teamScope ?? undefined,
        sensitivityTags: doc.sensitivityTags,
        title: doc.title ?? undefined,
        contentExcerpt: doc.content.slice(0, CONTENT_EXCERPT_LIMIT),
        ingestedAt: doc.ingestedAt.toISOString(),
      };
    });

    const response: RetrievalQueryResponse = {
      results,
      count: results.length,
      authOutcome: "allowed",
      queriedAt,
    };

    res.json(response);
  });

  /**
   * Health check for the retrieval subsystem. Returns document counts and
   * connectivity status without any auth enforcement.
   */
  router.get("/health", async function _getRetrievalHealth(req, res)
  {
    // 1. Count indexed documents to validate the org index is reachable.
    const totalDocuments = await prisma.orgDocument.count();
    const sourceCounts = await prisma.orgDocument.groupBy({
      by: ["source"],
      _count: { id: true },
    });

    res.json({
      status: "ok",
      totalDocuments,
      sources: sourceCounts.map(function _toSourceEntry(row)
      {
        return { source: row.source, count: row._count.id };
      }),
    });
  });

  return router;
}
