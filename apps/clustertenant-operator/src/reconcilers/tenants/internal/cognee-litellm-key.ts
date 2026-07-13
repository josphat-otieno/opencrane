import { Buffer } from "node:buffer";

import * as k8s from "@kubernetes/client-node";
import type { Logger } from "pino";

import type { OpenClawTenantOperatorConfig } from "../../../app/config.js";
import { __K8sApplyResource } from "@opencrane/infra/api";

/**
 * The Secret name the Cognee Deployment's Helm template expects this key under. Fixed
 * (not release-prefixed) because it is a per-silo/per-namespace singleton — exactly one
 * Cognee Deployment exists per release/namespace — and the operator (which mints this
 * key at runtime) has no way to compute the chart's `opencrane.fullname` release prefix.
 * `apps/clustertenant-platform/templates/cognee-deployment.yaml` MUST reference this
 * exact literal name.
 */
export const COGNEE_LITELLM_KEY_SECRET_NAME = "cognee-litellm-key";

/**
 * Handles LiteLLM virtual key provisioning for the silo's own Cognee instance.
 *
 * Mirrors {@link import("./tenant-litellm-keys.js").TenantLiteLlmKeys} (same generate/
 * update/Secret shape) but is scoped to the SILO's ClusterTenant, not an openclaw Tenant:
 * there is exactly one Cognee per silo, so exactly one key, minted once at operator boot
 * and reconciled thereafter. Deliberately NEVER sends `team_id` — LiteLLM's Team object
 * is not provisioned anywhere in this codebase (see the elewa reconcile-loop 404s this
 * causes for tenant keys that DO set `team_id`), so Cognee's key stays unscoped-but-own,
 * which still gives it fully independent, separately trackable spend via its own
 * `key_alias`/budget — the actual requirement (Cognee spend must not fold into tenant
 * chat spend) does not need a Team object to be satisfied.
 */
export class CogneeLiteLlmKey
{
  private config: OpenClawTenantOperatorConfig;
  private coreApi: k8s.CoreV1Api;
  private objectApi: k8s.KubernetesObjectApi;
  private appsApi: k8s.AppsV1Api;
  private log: Logger;

  constructor(
    config: OpenClawTenantOperatorConfig,
    coreApi: k8s.CoreV1Api,
    objectApi: k8s.KubernetesObjectApi,
    appsApi: k8s.AppsV1Api,
    log: Logger,
  )
  {
    this.config = config;
    this.coreApi = coreApi;
    this.objectApi = objectApi;
    this.appsApi = appsApi;
    this.log = log;
  }

  /**
   * Ensure this silo's Cognee has a dedicated LiteLLM virtual key Secret, minting or
   * updating it as needed. No-ops when LiteLLM integration is disabled.
   *
   * @param clusterTenantName - This silo's own ClusterTenant name (from
   *        `_ResolveOwnClusterTenantName`), used only for the key's alias/metadata —
   *        never sent as `team_id`.
   * @param namespace - The silo's own namespace (where Cognee's Deployment lives).
   */
  async ensureCogneeLiteLlmKeySecret(clusterTenantName: string, namespace: string): Promise<void>
  {
    if (!this.config.liteLlmEnabled)
    {
      return;
    }

    if (!this.config.liteLlmMasterKey)
    {
      throw new Error("LITELLM_MASTER_KEY is required when LITELLM_ENABLED=true");
    }

    const budget = this.config.cogneeLiteLlmMonthlyBudgetUsd;
    const existingKey = await this._readExistingKeyValue(namespace);
    if (existingKey !== undefined)
    {
      await this._updateLiteLlmVirtualKey(existingKey, clusterTenantName, budget);
      // .info (not .debug): the deployed fleet runs LOG_LEVEL=info, so a .debug line here was
      // PERMANENTLY invisible in production — the only way to tell this path fired (vs. the
      // create+restart path) was inferring it from the ABSENCE of the create-path's own .info
      // line. This is exactly the log a human/agent needs when diagnosing the boot-order race
      // this class of Secret can hit (see `_restartCogneeDeployment`'s doc comment).
      this.log.info({ clusterTenantName, budget }, "reconciled existing cognee litellm virtual key params (no restart — key value unchanged)");
      return;
    }

    const issuedAt = new Date().toISOString();
    const keyAlias = `opencrane-cognee-${clusterTenantName}`;
    const apiKey = await this._generateLiteLlmVirtualKey(clusterTenantName, budget);
    const secret: k8s.V1Secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: COGNEE_LITELLM_KEY_SECRET_NAME,
        namespace,
        labels: {
          "app.kubernetes.io/part-of": "opencrane",
          "app.kubernetes.io/component": "cognee",
          "app.kubernetes.io/managed-by": "opencrane-clustertenant-manager",
        },
        annotations: {
          "opencrane.io/litellm-key-alias": keyAlias,
          "opencrane.io/litellm-issued-at": issuedAt,
          "opencrane.io/litellm-monthly-budget-usd": String(budget),
        },
      },
      type: "Opaque",
      data: {
        apiKey: Buffer.from(apiKey).toString("base64"),
      },
    };

    await __K8sApplyResource(this.objectApi, secret, this.log);
    this.log.info({ clusterTenantName, budget }, "created cognee litellm virtual key secret");

    // Close the boot-order race: Cognee's Deployment is Helm-templated and starts as part of
    // the SAME `helm upgrade` that rolls this manager pod, with no ordering guarantee that this
    // Secret exists first. `secretKeyRef` env vars resolve empty (not an error, since the chart
    // marks them `optional: true`) when the Secret is missing at pod start, and — being env vars,
    // not a mounted volume — never pick up the Secret's value without a restart. Only needed on
    // the CREATE path: an update-existing-secret reconcile doesn't rotate the key value, so any
    // pod already running still has the credential it started with.
    await this._restartCogneeDeployment(namespace, clusterTenantName);
  }

  /**
   * Request a new LiteLLM virtual key scoped to this silo's Cognee instance.
   */
  private async _generateLiteLlmVirtualKey(clusterTenantName: string, monthlyBudgetUsd: number): Promise<string>
  {
    const response = await fetch(`${this.config.liteLlmEndpoint}/key/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${this.config.liteLlmMasterKey}`,
      },
      body: JSON.stringify({
        key_alias: `opencrane-cognee-${clusterTenantName}`,
        metadata: { clusterTenant: clusterTenantName, component: "cognee" },
        max_budget: monthlyBudgetUsd,
        budget_duration: this.config.liteLlmBudgetDuration,
      }),
    });

    if (!response.ok)
    {
      const body = await response.text();
      throw new Error(`LiteLLM key generation failed for cognee (${response.status}): ${body}`);
    }

    const payload = await response.json() as { key?: string; api_key?: string; generated_key?: string };
    const key = payload.key ?? payload.api_key ?? payload.generated_key;
    if (!key)
    {
      throw new Error("LiteLLM key generation response did not include a key");
    }

    return key;
  }

  /**
   * Re-apply the desired budget to the existing Cognee key via `/key/update`. Best-effort
   * and non-fatal — mirrors the tenant-key posture (a LiteLLM blip must not crash the
   * silo's reconcile loop).
   */
  private async _updateLiteLlmVirtualKey(keyValue: string, clusterTenantName: string, monthlyBudgetUsd: number): Promise<void>
  {
    try
    {
      const response = await fetch(`${this.config.liteLlmEndpoint}/key/update`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${this.config.liteLlmMasterKey}`,
        },
        body: JSON.stringify({
          key: keyValue,
          max_budget: monthlyBudgetUsd,
          budget_duration: this.config.liteLlmBudgetDuration,
        }),
      });

      if (!response.ok)
      {
        const body = await response.text();
        this.log.warn({ clusterTenantName, status: response.status, body }, "cognee litellm key update failed; existing key params left as-is");
      }
    }
    catch (err)
    {
      this.log.warn({ clusterTenantName, err }, "cognee litellm key update threw; existing key params left as-is");
    }
  }

  /**
   * Read the current key value from the existing Secret, or `undefined` when absent.
   */
  private async _readExistingKeyValue(namespace: string): Promise<string | undefined>
  {
    try
    {
      const secret = await this.coreApi.readNamespacedSecret({ name: COGNEE_LITELLM_KEY_SECRET_NAME, namespace });
      const encoded = secret.data?.["apiKey"];
      if (!encoded)
      {
        return undefined;
      }

      return Buffer.from(encoded, "base64").toString("utf8");
    }
    catch
    {
      return undefined;
    }
  }

  /**
   * Trigger a rollout restart of this silo's Cognee Deployment so it picks up the just-minted
   * key Secret — mirrors what `kubectl rollout restart` does under the hood (a pod-template
   * annotation patch), since a Secret consumed via `secretKeyRef` env vars never refreshes on
   * its own. Discovered by label (`app.kubernetes.io/component: cognee`, matching
   * `cognee-deployment.yaml`'s own labels) rather than by name — the operator cannot compute
   * the chart's release-prefixed Deployment name, and there is exactly one Cognee Deployment
   * per namespace (documented invariant), so label discovery is safe and chart-agnostic.
   *
   * Best-effort and non-fatal: the Secret is already durably written regardless of whether this
   * succeeds — a failure here (RBAC, no Cognee installed yet, API hiccup) just means Cognee picks
   * up the credential on its NEXT restart (a future deploy, pod eviction, etc.) instead of now.
   */
  private async _restartCogneeDeployment(namespace: string, clusterTenantName: string): Promise<void>
  {
    try
    {
      const list = await this.appsApi.listNamespacedDeployment({
        namespace,
        labelSelector: "app.kubernetes.io/component=cognee",
      });
      const deployments = list.items ?? [];
      if (deployments.length === 0)
      {
        this.log.debug({ clusterTenantName, namespace }, "no cognee deployment found to restart (not installed in this release?)");
        return;
      }

      for (const deployment of deployments)
      {
        const name = deployment.metadata?.name;
        if (!name)
        {
          continue;
        }

        await this.appsApi.patchNamespacedDeployment(
          {
            name,
            namespace,
            body: {
              spec: {
                template: {
                  metadata: {
                    annotations: { "opencrane.io/restarted-at": new Date().toISOString() },
                  },
                },
              },
            },
          },
          k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.StrategicMergePatch),
        );
        this.log.info({ clusterTenantName, namespace, deployment: name }, "restarted cognee deployment to pick up its new litellm key");
      }
    }
    catch (err)
    {
      this.log.warn({ clusterTenantName, namespace, err }, "cognee deployment restart failed; it will pick up the new key on its next natural restart instead");
    }
  }
}
