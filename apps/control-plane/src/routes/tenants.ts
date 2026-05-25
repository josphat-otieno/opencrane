import * as k8s from "@kubernetes/client-node";
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

import type { CreateTenantRequest, TenantDatasetsResponse, TenantResponse, UpdateTenantDatasetsRequest } from "../types.js";
import { _DetectTenantProjectionDrift } from "./internal/projection-drift.js";
import { _RepairTenantProjection } from "./internal/projection-repair.js";
import { OPENCRANE_API_GROUP, OPENCRANE_API_VERSION, TENANT_CRD_PLURAL } from "./internal/crd-constants.js";
import { _ParseTenantDatasetMembership, _SerializeTenantDatasetMembership } from "./internal/tenant-datasets.js";

/** Tenant CR appearance SLO constants. */
const TENANT_CR_APPEARANCE_TIMEOUT_MS = 30_000;
const TENANT_CR_APPEARANCE_POLL_INTERVAL_MS = 500;

/**
 * Creates an Express router that exposes CRUD operations and
 * suspend/resume actions for Tenant custom resources.
 * Dual-writes to both K8s CRDs and PostgreSQL via Prisma.
 * @param customApi - Kubernetes custom objects API client
 * @param prisma - Prisma ORM client
 * @returns Configured Express Router
 */
export function tenantsRouter(customApi: k8s.CustomObjectsApi, prisma: PrismaClient): Router
{
  const router = Router();
  const namespace = process.env.NAMESPACE ?? "default";

  /**
   * Report detect-only drift between Tenant CRDs and PostgreSQL projection rows.
   */
  router.get("/drift", async function _getTenantProjectionDrift(req, res)
  {
    const report = await _DetectTenantProjectionDrift(customApi, prisma, namespace);
    res.json(report);
  });

  /**
   * Repair Tenant projection rows from CRD source of truth.
   * Defaults to dry-run; pass ?dryRun=false to apply writes.
   */
  router.post("/repair", async function _postTenantProjectionRepair(req, res)
  {
    const dryRun = req.query["dryRun"] !== "false";
    const report = await _RepairTenantProjection(customApi, prisma, namespace, dryRun);
    res.json(report);
  });

  /** List all tenants from the database. */
  router.get("/", async function _listTenants(req, res)
  {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
    });

    const response: TenantResponse[] = tenants.map(function _mapTenant(t)
    {
      return {
        name: t.name,
        displayName: t.displayName,
        email: t.email,
        team: t.team ?? undefined,
        phase: t.phase,
        ingressHost: t.ingressHost ?? undefined,
        createdAt: t.createdAt.toISOString(),
      };
    });

    res.json(response);
  });

  /** Get dataset memberships for a tenant from Tenant CR annotations. */
  router.get("/:name/datasets", async function _getTenantDatasets(req, res)
  {
    try
    {
      const tenant = await customApi.getNamespacedCustomObject({
        group: OPENCRANE_API_GROUP,
        version: OPENCRANE_API_VERSION,
        namespace,
        plural: TENANT_CRD_PLURAL,
        name: req.params.name,
      }) as { metadata?: { annotations?: Record<string, string> } };

      const response: TenantDatasetsResponse = _ParseTenantDatasetMembership(tenant.metadata?.annotations);
      res.json(response);
    }
    catch (error)
    {
      if (_IsKubernetesNotFoundError(error))
      {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      res.status(502).json({ error: "Failed to load tenant datasets" });
    }
  });

  /** Update dataset memberships for a tenant and persist them as Tenant CR annotations. */
  router.put("/:name/datasets", async function _putTenantDatasets(req, res)
  {
    // 1. Validate body shape early so malformed requests never reach Kubernetes mutation paths.
    const name = req.params.name;
    const body = req.body as Partial<UpdateTenantDatasetsRequest>;
    const membership = _ValidateTenantDatasetUpdate(body);

    if (!membership)
    {
      res.status(400).json({ error: "org, team, project, and personal must all be string arrays" });
      return;
    }

    // 2. Read the current Tenant CR first so we preserve unrelated annotations on patch.
    let tenant: { metadata?: { annotations?: Record<string, string> } };
    try
    {
      tenant = await customApi.getNamespacedCustomObject({
        group: OPENCRANE_API_GROUP,
        version: OPENCRANE_API_VERSION,
        namespace,
        plural: TENANT_CRD_PLURAL,
        name,
      }) as { metadata?: { annotations?: Record<string, string> } };
    }
    catch (error)
    {
      if (_IsKubernetesNotFoundError(error))
      {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      res.status(502).json({ error: "Failed to load tenant datasets" });
      return;
    }

    // 3. Patch normalized dataset annotations onto the tenant and persist an audit trail.
    const patch = {
      metadata: {
        annotations: {
          ...(tenant.metadata?.annotations ?? {}),
          ..._SerializeTenantDatasetMembership(membership),
        },
      },
    };

    try
    {
      await customApi.patchNamespacedCustomObject({
        group: OPENCRANE_API_GROUP,
        version: OPENCRANE_API_VERSION,
        namespace,
        plural: TENANT_CRD_PLURAL,
        name,
        body: patch,
      });
    }
    catch (error)
    {
      if (_IsKubernetesNotFoundError(error))
      {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      res.status(502).json({ error: "Failed to persist tenant datasets" });
      return;
    }

    try
    {
      await prisma.auditEntry.create({
        data: {
          tenant: name,
          action: "DatasetsUpdated",
          resource: `Tenant/${name}`,
          message: `Dataset memberships updated for tenant ${name}`,
          metadata: membership,
        },
      });
    }
    catch
    {
      // Best-effort audit write: dataset membership changes are already persisted in Kubernetes.
    }

    res.json(membership);
  });

  /** Get a single tenant by name. */
  router.get("/:name", async function _getTenant(req, res)
  {
    const tenant = await prisma.tenant.findUnique({
      where: { name: req.params.name },
    });

    if (!tenant)
    {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const response: TenantResponse = {
      name: tenant.name,
      displayName: tenant.displayName,
      email: tenant.email,
      team: tenant.team ?? undefined,
      phase: tenant.phase,
      ingressHost: tenant.ingressHost ?? undefined,
      createdAt: tenant.createdAt.toISOString(),
    };

    res.json(response);
  });

  /** Create a new tenant (dual-write: K8s CRD + database). */
  router.post("/", async function _createTenant(req, res)
  {
    const body = req.body as CreateTenantRequest;

    const tenantCr = {
      apiVersion: `${OPENCRANE_API_GROUP}/${OPENCRANE_API_VERSION}`,
      kind: "Tenant",
      metadata: { name: body.name, namespace },
      spec: {
        displayName: body.displayName,
        email: body.email,
        team: body.team,
        monthlyBudgetUsd: body.monthlyBudgetUsd,
        resources: body.resources,
        skills: body.skills,
        policyRef: body.policyRef,
      },
    };

    await customApi.createNamespacedCustomObject({
      group: OPENCRANE_API_GROUP,
      version: OPENCRANE_API_VERSION,
      namespace,
      plural: TENANT_CRD_PLURAL,
      body: tenantCr,
    });

    let tenantAppeared = false;
    try
    {
      tenantAppeared = await _WaitForTenantCrAppearance(
        customApi,
        body.name,
        namespace,
        _ReadPositiveIntEnv("TENANT_CR_APPEARANCE_TIMEOUT_MS", TENANT_CR_APPEARANCE_TIMEOUT_MS),
        _ReadPositiveIntEnv("TENANT_CR_APPEARANCE_POLL_INTERVAL_MS", TENANT_CR_APPEARANCE_POLL_INTERVAL_MS),
      );
    }
    catch
    {
      res.status(502).json({ error: "Failed to validate Tenant CR appearance in Kubernetes" });
      return;
    }

    if (!tenantAppeared)
    {
      res.status(504).json({ error: "Tenant CR did not appear in Kubernetes within 30 seconds" });
      return;
    }

    await prisma.tenant.create({
      data: {
        name: body.name,
        displayName: body.displayName,
        email: body.email,
        team: body.team,
      },
    });

    await prisma.auditEntry.create({
      data: {
        tenant: body.name,
        action: "Created",
        resource: `Tenant/${body.name}`,
        message: `Tenant ${body.name} created`,
      },
    });

    res.status(201).json({ name: body.name, status: "created" });
  });

  /** Update a tenant (dual-write: K8s CRD + database). */
  router.put("/:name", async function _updateTenant(req, res)
  {
    const name = req.params.name;
    const body = req.body as Partial<CreateTenantRequest>;

    const patch = {
      spec: {
        ...(body.displayName ? { displayName: body.displayName } : {}),
        ...(body.email ? { email: body.email } : {}),
        ...(body.team ? { team: body.team } : {}),
        ...(body.monthlyBudgetUsd !== undefined ? { monthlyBudgetUsd: body.monthlyBudgetUsd } : {}),
        ...(body.resources ? { resources: body.resources } : {}),
        ...(body.skills ? { skills: body.skills } : {}),
        ...(body.policyRef ? { policyRef: body.policyRef } : {}),
      },
    };

    await customApi.patchNamespacedCustomObject({
      group: OPENCRANE_API_GROUP,
      version: OPENCRANE_API_VERSION,
      namespace,
      plural: TENANT_CRD_PLURAL,
      name,
      body: patch,
    });

    await prisma.tenant.update({
      where: { name },
      data: {
        ...(body.displayName ? { displayName: body.displayName } : {}),
        ...(body.email ? { email: body.email } : {}),
        ...(body.team ? { team: body.team } : {}),
      },
    });

    await prisma.auditEntry.create({
      data: {
        tenant: name,
        action: "Updated",
        resource: `Tenant/${name}`,
        message: `Tenant ${name} updated`,
      },
    });

    res.json({ name, status: "updated" });
  });

  /** Delete a tenant (dual-write: K8s CRD + database). */
  router.delete("/:name", async function _deleteTenant(req, res)
  {
    const name = req.params.name;

    await customApi.deleteNamespacedCustomObject({
      group: OPENCRANE_API_GROUP,
      version: OPENCRANE_API_VERSION,
      namespace,
      plural: TENANT_CRD_PLURAL,
      name,
    });

    await prisma.auditEntry.create({
      data: {
        tenant: name,
        action: "Deleted",
        resource: `Tenant/${name}`,
        message: `Tenant ${name} deleted`,
      },
    });

    await prisma.tenant.delete({ where: { name } });

    res.json({ name, status: "deleted" });
  });

  /** Suspend a tenant (scale deployment to zero). */
  router.post("/:name/suspend", async function _suspendTenant(req, res)
  {
    const name = req.params.name;

    await customApi.patchNamespacedCustomObject({
      group: OPENCRANE_API_GROUP,
      version: OPENCRANE_API_VERSION,
      namespace,
      plural: TENANT_CRD_PLURAL,
      name,
      body: { spec: { suspended: true } },
    });

    await prisma.tenant.update({
      where: { name },
      data: { phase: "Suspended" },
    });

    await prisma.auditEntry.create({
      data: {
        tenant: name,
        action: "Suspended",
        resource: `Tenant/${name}`,
        message: `Tenant ${name} suspended`,
      },
    });

    res.json({ name, status: "suspended" });
  });

  /** Resume a suspended tenant. */
  router.post("/:name/resume", async function _resumeTenant(req, res)
  {
    const name = req.params.name;

    await customApi.patchNamespacedCustomObject({
      group: OPENCRANE_API_GROUP,
      version: OPENCRANE_API_VERSION,
      namespace,
      plural: TENANT_CRD_PLURAL,
      name,
      body: { spec: { suspended: false } },
    });

    await prisma.tenant.update({
      where: { name },
      data: { phase: "Running" },
    });

    await prisma.auditEntry.create({
      data: {
        tenant: name,
        action: "Resumed",
        resource: `Tenant/${name}`,
        message: `Tenant ${name} resumed`,
      },
    });

    res.json({ name, status: "resumed" });
  });

  return router;
}

/**
 * Validate and normalize a tenant dataset membership update payload.
 * @param body - Raw request body.
 */
function _ValidateTenantDatasetUpdate(body: Partial<UpdateTenantDatasetsRequest>): UpdateTenantDatasetsRequest | null
{
  if (!Array.isArray(body.org) || !Array.isArray(body.team) || !Array.isArray(body.project) || !Array.isArray(body.personal))
  {
    return null;
  }

  if (!_IsStringArray(body.org) || !_IsStringArray(body.team) || !_IsStringArray(body.project) || !_IsStringArray(body.personal))
  {
    return null;
  }

  return {
    org: body.org,
    team: body.team,
    project: body.project,
    personal: body.personal,
  };
}

/**
 * Check whether every element in the provided array is a string.
 * @param value - Candidate value.
 */
function _IsStringArray(value: unknown[]): value is string[]
{
  return value.every(function _isString(entry)
  {
    return typeof entry === "string";
  });
}

/**
 * Check whether an unknown Kubernetes client error represents a not-found response.
 * @param error - Unknown thrown error from Kubernetes client calls.
 */
function _IsKubernetesNotFoundError(error: unknown): boolean
{
  if (typeof error !== "object" || error === null)
  {
    return false;
  }

  const errorObject = error as {
    statusCode?: number;
    response?: { statusCode?: number };
    body?: { code?: number };
  };
  const statusCode = errorObject.statusCode ?? errorObject.response?.statusCode ?? errorObject.body?.code;
  return statusCode === 404;
}

/**
 * Wait until a newly-created tenant becomes observable as a Tenant CR.
 * @param customApi - Kubernetes custom objects API client.
 * @param tenantName - Tenant resource name.
 * @param namespace - Kubernetes namespace.
 * @param timeoutMs - Maximum wait time in milliseconds.
 * @param pollIntervalMs - Polling interval in milliseconds.
 */
async function _WaitForTenantCrAppearance(
  customApi: k8s.CustomObjectsApi,
  tenantName: string,
  namespace: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<boolean>
{
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline)
  {
    try
    {
      await customApi.getNamespacedCustomObject({
        group: OPENCRANE_API_GROUP,
        version: OPENCRANE_API_VERSION,
        namespace,
        plural: TENANT_CRD_PLURAL,
        name: tenantName,
      });

      return true;
    }
    catch (error)
    {
      if (!_IsKubernetesNotFoundError(error))
      {
        throw error;
      }
    }

    await _Sleep(pollIntervalMs);
  }

  return false;
}

/**
 * Parse positive integer env vars with fallback values.
 * @param key - Environment variable name.
 * @param fallback - Fallback value.
 */
function _ReadPositiveIntEnv(key: string, fallback: number): number
{
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Sleep for the provided duration.
 * @param durationMs - Duration in milliseconds.
 */
async function _Sleep(durationMs: number): Promise<void>
{
  await new Promise(function _resolveAfterSleep(resolve)
  {
    setTimeout(resolve, durationMs);
  });
}
