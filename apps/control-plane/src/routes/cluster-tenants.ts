import { Router } from "express";
import { ClusterTenantPhase, ClusterTenantTierUnavailableCode } from "@opencrane/contracts";
import type { ClusterTenantProvisionerRegistry } from "@opencrane/contracts";
import type { Prisma, PrismaClient } from "@prisma/client";

import type { ClusterTenantComputeInput, ClusterTenantCreateRequest, ClusterTenantResourcesInput, ClusterTenantUpdateRequest } from "./cluster-tenants.types.js";

/** A cluster_tenants row as read back from Prisma (subset consumed here). */
type ClusterTenantRow = Prisma.ClusterTenantGetPayload<Record<string, never>>;

/** Map the contract isolation tier (lowercase) to the Prisma enum member (PascalCase). */
function _toPrismaTier(tier: ClusterTenantIsolationTier): "Shared" | "DedicatedNodes" | "DedicatedCluster"
{
  switch (tier)
  {
    case ClusterTenantIsolationTier.Shared: return "Shared";
    case ClusterTenantIsolationTier.DedicatedNodes: return "DedicatedNodes";
    case ClusterTenantIsolationTier.DedicatedCluster: return "DedicatedCluster";
  }
}

/** Map the contract compute mode (lowercase) to the Prisma enum member (PascalCase). */
function _toPrismaCompute(mode: ClusterTenantComputeMode): "Shared" | "Dedicated"
{
  return mode === ClusterTenantComputeMode.Dedicated ? "Dedicated" : "Shared";
}

/** Map a Prisma isolation-tier enum member back to the contract tier value. */
function _fromPrismaTier(value: string): ClusterTenantIsolationTier
{
  switch (value)
  {
    case "DedicatedNodes": return ClusterTenantIsolationTier.DedicatedNodes;
    case "DedicatedCluster": return ClusterTenantIsolationTier.DedicatedCluster;
    default: return ClusterTenantIsolationTier.Shared;
  }
}

/** Map a Prisma compute-mode enum member back to the contract compute value. */
function _fromPrismaCompute(value: string): ClusterTenantComputeMode
{
  return value === "Dedicated" ? ClusterTenantComputeMode.Dedicated : ClusterTenantComputeMode.Shared;
}

/** Map the stored phase string back to the contract phase enum (defaults to pending). */
function _fromPrismaPhase(value: string): ClusterTenantPhase
{
  switch (value)
  {
    case "provisioning": return ClusterTenantPhase.Provisioning;
    case "ready": return ClusterTenantPhase.Ready;
    case "failed": return ClusterTenantPhase.Failed;
    default: return ClusterTenantPhase.Pending;
  }
}

/** Whether a value is one of the contract isolation-tier strings. */
function _isIsolationTier(value: unknown): value is ClusterTenantIsolationTier
{
  return value === ClusterTenantIsolationTier.Shared || value === ClusterTenantIsolationTier.DedicatedNodes || value === ClusterTenantIsolationTier.DedicatedCluster;
}

/** Whether a value is one of the contract compute-mode strings. */
function _isComputeMode(value: unknown): value is ClusterTenantComputeMode
{
  return value === ClusterTenantComputeMode.Shared || value === ClusterTenantComputeMode.Dedicated;
}

/** RFC-1123-ish DNS domain: lowercase labels, ≥1 dot, alpha TLD, ≤253 chars. */
const _BASE_DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** Whether a string is a syntactically valid customer base domain. */
function _isValidBaseDomain(value: string): boolean
{
  return _BASE_DOMAIN_PATTERN.test(value);
}

/**
 * Validate a compute block: a dedicated mode requires a node pool, otherwise the
 * operator could place pods on no machines at all.
 *
 * @param compute - Compute input from the request body.
 * @returns A validation error message, or null when valid.
 */
function _validateCompute(compute: ClusterTenantComputeInput | undefined): string | null
{
  if (!compute || !_isComputeMode(compute.mode))
  {
    return "compute.mode must be 'shared' or 'dedicated'.";
  }
  if (compute.mode === ClusterTenantComputeMode.Dedicated && !compute.nodePool?.trim())
  {
    return "compute.nodePool is required when compute.mode is 'dedicated'.";
  }
  return null;
}

/**
 * Validate a resources block: the quota object must be present (it is the
 * resource ceiling enforced over the customer's namespace).
 *
 * @param resources - Resources input from the request body.
 * @returns A validation error message, or null when valid.
 */
function _validateResources(resources: ClusterTenantResourcesInput | undefined): string | null
{
  if (!resources || typeof resources.quota !== "object" || resources.quota === null)
  {
    return "resources.quota must be provided.";
  }
  return null;
}

/**
 * Project a stored row into the shared {@link ClusterTenant} contract shape.
 *
 * @param row - The persisted cluster_tenants row.
 * @returns The contract representation returned to API clients.
 */
function _toContract(row: ClusterTenantRow): ClusterTenant
{
  return {
    name: row.name,
    displayName: row.displayName,
    ...(row.baseDomain ? { baseDomain: row.baseDomain } : {}),
    isolationTier: _fromPrismaTier(row.isolationTier as unknown as string),
    compute: {
      mode: _fromPrismaCompute(row.computeMode as unknown as string),
      ...(row.nodePool ? { nodePool: row.nodePool } : {}),
    },
    resources: { quota: (row.quota as ClusterTenantResourceQuota | null) ?? {} },
    status: {
      phase: _fromPrismaPhase(row.phase),
      ...(row.message ? { message: row.message } : {}),
      ...(row.boundNamespace ? { boundNamespace: row.boundNamespace } : {}),
      ...(row.provisioner ? { provisioner: row.provisioner } : {}),
    },
  };
}

/**
 * CRUD router for the first-class cluster tenant (customer / isolation unit).
 *
 * Over-tier requests — an `isolationTier` no registered provisioner can serve
 * (e.g. `dedicatedCluster` with no external webhook configured) — are rejected
 * with HTTP 422 and the coded error {@link ClusterTenantTierUnavailableCode}.
 *
 * @param prisma   - Prisma client used for persistence (dual-writes the row).
 * @param registry - Provisioner registry used to gate isolation tiers (CT.6).
 * @returns Configured Express router.
 */
export function clusterTenantsRouter(prisma: PrismaClient, registry: ClusterTenantProvisionerRegistry): Router
{
  const router = Router();

  /** List all cluster tenants. */
  router.get("/", async function _listClusterTenants(req, res)
  {
    const rows = await prisma.clusterTenant.findMany({ orderBy: { createdAt: "asc" } });
    res.json(rows.map(_ToContract));
  });

  /** Get a single cluster tenant by name. */
  router.get("/:name", async function _getClusterTenant(req, res)
  {
    const row = await prisma.clusterTenant.findUnique({ where: { name: req.params.name } });
    if (!row)
    {
      res.status(404).json({ error: "Cluster tenant not found", code: "CLUSTER_TENANT_NOT_FOUND" });
      return;
    }
    res.json(_ToContract(row));
  });

  /** Get just the observed status of a cluster tenant. */
  router.get("/:name/status", async function _getClusterTenantStatus(req, res)
  {
    const row = await prisma.clusterTenant.findUnique({ where: { name: req.params.name } });
    if (!row)
    {
      res.status(404).json({ error: "Cluster tenant not found", code: "CLUSTER_TENANT_NOT_FOUND" });
      return;
    }
    res.json(_ToContract(row).status);
  });

  /** Create a cluster tenant, gating the requested isolation tier on the registry. */
  router.post("/", async function _createClusterTenant(req, res)
  {
    const body = req.body as ClusterTenantCreateRequest;

    // 1. Validate identity + isolation tier up front so a malformed request never
    //    reaches the database or the tier-availability gate.
    if (!body?.name?.trim() || !body?.displayName?.trim())
    {
      res.status(400).json({ error: "name and displayName are required.", code: "VALIDATION_ERROR" });
      return;
    }
    if (!_IsIsolationTier(body.isolationTier))
    {
      res.status(400).json({ error: "isolationTier must be 'shared', 'dedicatedNodes', or 'dedicatedCluster'.", code: "VALIDATION_ERROR" });
      return;
    }
    if (body.baseDomain !== undefined && body.baseDomain.trim() && !_isValidBaseDomain(body.baseDomain.trim()))
    {
      res.status(400).json({ error: "baseDomain must be a valid lowercase DNS domain (e.g. ai.client-company.com).", code: "VALIDATION_ERROR" });
      return;
    }

    // 2. Validate compute placement and resource gating — a dedicated pool needs
    //    a node-pool name, and a quota ceiling must always be supplied.
    const computeError = _ValidateCompute(body.compute);
    if (computeError)
    {
      res.status(400).json({ error: computeError, code: "VALIDATION_ERROR" });
      return;
    }
    const resourcesError = _ValidateResources(body.resources);
    if (resourcesError)
    {
      res.status(400).json({ error: resourcesError, code: "VALIDATION_ERROR" });
      return;
    }

    // 3. Reject an over-tier request: no registered provisioner can serve it, so
    //    persisting it would strand the customer in `pending` forever.
    if (!registry.isTierAvailable(body.isolationTier))
    {
      res.status(422).json({ error: `No provisioner is registered for isolation tier '${body.isolationTier}'.`, code: ClusterTenantTierUnavailableCode });
      return;
    }

    // 4. Dual-write the row in `pending`; the operator reconciles it to `ready`.
    const created = await prisma.clusterTenant.create({
      data: {
        name: body.name.trim(),
        displayName: body.displayName.trim(),
        baseDomain: body.baseDomain?.trim() || null,
        isolationTier: _toPrismaTier(body.isolationTier),
        computeMode: _toPrismaCompute(body.compute.mode),
        nodePool: body.compute.nodePool?.trim() || null,
        quota: (body.resources.quota as Prisma.InputJsonValue),
        phase: ClusterTenantPhase.Pending,
      },
    });
    res.status(201).json(_ToContract(created));
  });

  /** Update a cluster tenant, re-gating the isolation tier when it changes. */
  router.put("/:name", async function _updateClusterTenant(req, res)
  {
    const body = req.body as ClusterTenantUpdateRequest;
    const existing = await prisma.clusterTenant.findUnique({ where: { name: req.params.name } });
    if (!existing)
    {
      res.status(404).json({ error: "Cluster tenant not found", code: "CLUSTER_TENANT_NOT_FOUND" });
      return;
    }

    const data: Prisma.ClusterTenantUpdateInput = {};

    // 1. Apply display-name change when present (non-blank).
    if (body.displayName !== undefined)
    {
      if (!body.displayName.trim())
      {
        res.status(400).json({ error: "displayName must not be blank.", code: "VALIDATION_ERROR" });
        return;
      }
      data.displayName = body.displayName.trim();
    }

    // 1b. Apply base-domain change when present; an empty string clears it (back to
    //     the per-instance ingress.domain fallback), a non-empty value must be valid.
    if (body.baseDomain !== undefined)
    {
      const trimmed = body.baseDomain.trim();
      if (trimmed && !_isValidBaseDomain(trimmed))
      {
        res.status(400).json({ error: "baseDomain must be a valid lowercase DNS domain (e.g. ai.client-company.com).", code: "VALIDATION_ERROR" });
        return;
      }
      data.baseDomain = trimmed || null;
    }

    // 2. Re-validate and re-gate the isolation tier when it changes — a customer
    //    must not be moved to a tier no provisioner can serve.
    if (body.isolationTier !== undefined)
    {
      if (!_IsIsolationTier(body.isolationTier))
      {
        res.status(400).json({ error: "isolationTier must be 'shared', 'dedicatedNodes', or 'dedicatedCluster'.", code: "VALIDATION_ERROR" });
        return;
      }
      if (!registry.isTierAvailable(body.isolationTier))
      {
        res.status(422).json({ error: `No provisioner is registered for isolation tier '${body.isolationTier}'.`, code: ClusterTenantTierUnavailableCode });
        return;
      }
      data.isolationTier = _ToPrismaTier(body.isolationTier);
    }

    // 3. Re-validate compute placement when changed (dedicated needs a pool).
    if (body.compute !== undefined)
    {
      const computeError = _ValidateCompute(body.compute);
      if (computeError)
      {
        res.status(400).json({ error: computeError, code: "VALIDATION_ERROR" });
        return;
      }
      data.computeMode = _ToPrismaCompute(body.compute.mode);
      data.nodePool = body.compute.nodePool?.trim() || null;
    }

    // 4. Re-validate the resources block when changed (quota must be present).
    if (body.resources !== undefined)
    {
      const resourcesError = _ValidateResources(body.resources);
      if (resourcesError)
      {
        res.status(400).json({ error: resourcesError, code: "VALIDATION_ERROR" });
        return;
      }
      data.quota = (body.resources.quota as Prisma.InputJsonValue);
    }

    const updated = await prisma.clusterTenant.update({ where: { name: req.params.name }, data });
    res.json(_ToContract(updated));
  });

  /** Delete a cluster tenant. */
  router.delete("/:name", async function _deleteClusterTenant(req, res)
  {
    const existing = await prisma.clusterTenant.findUnique({ where: { name: req.params.name } });
    if (!existing)
    {
      res.status(404).json({ error: "Cluster tenant not found", code: "CLUSTER_TENANT_NOT_FOUND" });
      return;
    }
    await prisma.clusterTenant.delete({ where: { name: req.params.name } });
    res.json({ name: req.params.name, status: "deleted" });
  });

  return router;
}
