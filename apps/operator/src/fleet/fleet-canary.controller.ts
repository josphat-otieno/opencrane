import type * as k8s from "@kubernetes/client-node";
import type { Logger } from "pino";

import type { CanaryPhase, CanaryRolloutEntry, FleetUpdateConfig } from "./fleet.types.js";
import { OPENCRANE_API_GROUP, OPENCRANE_API_VERSION, TENANT_CRD_PLURAL } from "../shared/crd-constants.js";

/**
 * Fleet canary update controller.
 *
 * Manages rolling version updates across the tenant fleet using a canary
 * strategy: one tenant is updated first, the operator waits for its pod to
 * become Ready, and — if it does — rolls the update to all remaining tenants.
 * On canary failure the canary tenant is reverted and no further tenants update.
 *
 * This controller is instantiated once per operator process and holds
 * in-memory state for the current rollout. Restart the operator to cancel
 * an in-flight rollout.
 */
export class FleetCanaryController
{
  /** Kubernetes Custom Objects API for Tenant CRD patching. */
  private readonly _customApi: k8s.CustomObjectsApi;

  /** Kubernetes Apps V1 API for Deployment status polling. */
  private readonly _appsApi: k8s.AppsV1Api;

  /** Scoped logger for fleet update events. */
  private readonly _log: Logger;

  /** Operator namespace for Tenant CRD operations. */
  private readonly _namespace: string;

  /** Fleet update configuration. */
  private readonly _config: FleetUpdateConfig;

  /** Current phase of the rollout. */
  private _phase: CanaryPhase = "idle";

  /** Rollout entries for the current update session. */
  private _entries: CanaryRolloutEntry[] = [];

  /**
   * Create a new FleetCanaryController.
   * @param customApi - Kubernetes Custom Objects API client.
   * @param appsApi   - Kubernetes Apps V1 API client.
   * @param log       - Base pino logger; component sub-scoped internally.
   * @param namespace - Kubernetes namespace for tenant CRD operations.
   * @param config    - Fleet update configuration.
   */
  constructor(
    customApi: k8s.CustomObjectsApi,
    appsApi: k8s.AppsV1Api,
    log: Logger,
    namespace: string,
    config: FleetUpdateConfig,
  )
  {
    this._customApi = customApi;
    this._appsApi = appsApi;
    this._log = log.child({ component: "fleet-canary" });
    this._namespace = namespace;
    this._config = config;
  }

  /**
   * Query npm registry for the latest published version of the openclaw package.
   * Returns null when the registry is unreachable or the response is malformed.
   */
  async getLatestRelease(): Promise<string | null>
  {
    try
    {
      const response = await fetch(
        `https://registry.npmjs.org/openclaw/${this._config.releaseTag}`,
        { headers: { Accept: "application/json" } },
      );

      if (!response.ok)
      {
        return null;
      }

      const body = await response.json() as { version?: string };
      return body.version ?? null;
    }
    catch
    {
      return null;
    }
  }

  /**
   * Start a canary rollout for the given target version.
   *
   * Picks the first non-pinned tenant as the canary, patches its
   * `spec.openclawVersion`, waits for the Deployment to become ready,
   * then rolls to all remaining tenants or reverts on failure.
   *
   * @param targetVersion - The OpenClaw version string to roll out.
   * @param tenants       - All Tenant CR names eligible for update.
   */
  async startCanaryRollout(targetVersion: string, tenants: Array<{ name: string; version: string }>): Promise<void>
  {
    if (this._phase !== "idle")
    {
      this._log.warn({ phase: this._phase }, "rollout already in progress; skipping");
      return;
    }

    if (tenants.length === 0)
    {
      this._log.info("no eligible tenants for rollout");
      return;
    }

    this._phase = "canary";
    this._entries = [];

    // 1. Select the first tenant as the canary — operators can label a specific tenant
    //    as canary in Phase 4+ by checking for an annotation.
    const [canary, ...rest] = tenants;

    this._log.info({ canary: canary.name, targetVersion }, "starting canary rollout");

    // 2. Patch the canary tenant to the target version.
    const canaryEntry = await this._patchTenantVersion(canary.name, targetVersion, canary.version);
    this._entries.push(canaryEntry);

    // 3. Wait for the canary deployment to become Ready within the configured timeout.
    const canaryReady = await this._waitForDeploymentReady(`openclaw-${canary.name}`, this._config.canaryTimeoutMs);

    if (!canaryReady)
    {
      // 4a. Canary failed — revert the canary tenant and abort the rollout.
      this._log.error({ canary: canary.name, targetVersion }, "canary failed; rolling back");
      await this._patchTenantVersion(canary.name, canary.version, targetVersion);
      this._entries[0].success = false;
      this._entries[0].failureReason = "Deployment did not become Ready within timeout";
      this._phase = "rolled-back";
      return;
    }

    // 4b. Canary succeeded — roll out to remaining tenants.
    this._entries[0].success = true;
    this._phase = "rolling";

    this._log.info({ restCount: rest.length, targetVersion }, "canary passed; rolling to remaining tenants");

    for (const tenant of rest)
    {
      const entry = await this._patchTenantVersion(tenant.name, targetVersion, tenant.version);
      entry.success = true;
      this._entries.push(entry);
    }

    this._phase = "complete";
    this._log.info({ targetVersion, total: tenants.length }, "fleet rollout complete");
  }

  /** Return the current rollout phase. */
  getPhase(): CanaryPhase
  {
    return this._phase;
  }

  /** Return the rollout entries for the current session. */
  getEntries(): readonly CanaryRolloutEntry[]
  {
    return this._entries;
  }

  /** Reset the controller to idle so a new rollout can start. */
  reset(): void
  {
    this._phase = "idle";
    this._entries = [];
  }

  /**
   * Patch a Tenant CR's `spec.openclawVersion` field.
   * Returns a CanaryRolloutEntry recording the before/after version.
   */
  private async _patchTenantVersion(
    tenantName: string,
    targetVersion: string,
    previousVersion: string,
  ): Promise<CanaryRolloutEntry>
  {
    await this._customApi.patchNamespacedCustomObject({
      group: OPENCRANE_API_GROUP,
      version: OPENCRANE_API_VERSION,
      namespace: this._namespace,
      plural: TENANT_CRD_PLURAL,
      name: tenantName,
      body: { spec: { openclawVersion: targetVersion } },
    });

    this._log.info({ tenantName, targetVersion, previousVersion }, "patched tenant version");

    return {
      tenantName,
      targetVersion,
      previousVersion,
      startedAt: new Date().toISOString(),
      success: null,
    };
  }

  /**
   * Poll the Deployment readiness condition until it is satisfied or the timeout expires.
   *
   * @param deploymentName - Kubernetes Deployment name.
   * @param timeoutMs      - Maximum wait duration in milliseconds.
   * @returns True when the Deployment became ready; false on timeout.
   */
  private async _waitForDeploymentReady(deploymentName: string, timeoutMs: number): Promise<boolean>
  {
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 5000;

    // 1. Poll at intervals until the Deployment is Ready or the deadline passes.
    while (Date.now() < deadline)
    {
      try
      {
        const deployment = await this._appsApi.readNamespacedDeployment({
          name: deploymentName,
          namespace: this._namespace,
        });

        const status = deployment.status;
        const desired = status?.replicas ?? 0;
        const ready = status?.readyReplicas ?? 0;

        if (desired > 0 && ready >= desired)
        {
          return true;
        }
      }
      catch
      {
        // Deployment may not exist yet if the operator is still reconciling.
      }

      // 2. Wait before the next poll to avoid hammering the Kubernetes API.
      await new Promise<void>(function _sleep(resolve)
      {
        setTimeout(resolve, pollInterval);
      });
    }

    return false;
  }
}

/**
 * Build a FleetUpdateConfig from environment variables with sensible defaults.
 */
export function _ReadFleetUpdateConfig(): FleetUpdateConfig
{
  return {
    canaryTimeoutMs: Number(process.env.OPENCRANE_CANARY_TIMEOUT_MS ?? "300000"), // 5 min
    autoUpdateEnabled: process.env.OPENCRANE_AUTO_UPDATE_ENABLED === "true",
    releaseTag: process.env.OPENCRANE_RELEASE_TAG ?? "latest",
  };
}
