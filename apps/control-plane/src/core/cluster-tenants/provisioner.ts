import { ClusterTenantPhase } from "@opencrane/contracts";
import type { ClusterTenantProvisionRequest, ClusterTenantProvisionResult } from "@opencrane/contracts";

import type { ClusterTenantProvisioner, ExternalWebhookProvisionerConfig } from "./provisioner.types.js";

/** Stable identifier the built-in shared provisioner advertises in the registry. */
export const SHARED_PROVISIONER_ID = "shared";

/** Prefix applied to a customer key to derive its bound namespace. */
const _NAMESPACE_PREFIX = "opencrane-";

/**
 * Derive the deterministic namespace name bound to a customer key.
 *
 * @param name - Customer key.
 * @returns The `opencrane-<name>` namespace name.
 */
function _NamespaceFor(name: string): string
{
  return `${_NAMESPACE_PREFIX}${name}`;
}

/**
 * Built-in provisioner that fences a customer inside a shared cluster. It serves
 * the `shared` and `dedicatedNodes` tiers by mapping the customer to a namespace
 * (`opencrane-<name>`); the operator later stamps `nodeSelector`/`tolerations`
 * for the dedicated-nodes case. It does not talk to a live cluster here — it
 * resolves the boundary the management API persists.
 */
export class SharedClusterProvisioner implements ClusterTenantProvisioner
{
  /** Provision a `shared`/`dedicatedNodes` boundary by binding a namespace. */
  async provision(req: ClusterTenantProvisionRequest): Promise<ClusterTenantProvisionResult>
  {
    return {
      phase: ClusterTenantPhase.Ready,
      boundNamespace: _NamespaceFor(req.name),
    };
  }

  /** Tear down the shared boundary; namespace teardown is a no-op at this layer. */
  async deprovision(name: string): Promise<void>
  {
    void name;
  }

  /** Report the boundary as ready with its deterministically derived namespace. */
  async getStatus(name: string): Promise<ClusterTenantProvisionResult>
  {
    return {
      phase: ClusterTenantPhase.Ready,
      boundNamespace: _NamespaceFor(name),
    };
  }

  /** Shared tenants reuse the cluster's own kubeconfig, so none is brokered here. */
  async getKubeconfigRef(name: string): Promise<string | null>
  {
    void name;
    return null;
  }
}

/**
 * Provisioner that delegates a `dedicatedCluster` request to a configured
 * out-of-process HTTPS backend. It POSTs a vendor-neutral
 * {@link ClusterTenantProvisionRequest} and reads back a
 * {@link ClusterTenantProvisionResult} including a kubeconfig Secret *reference*
 * — credentials are never returned inline. Kept deliberately arm's-length and
 * vendor-agnostic so any hosted-control-plane backend can satisfy it.
 */
export class ExternalWebhookProvisioner implements ClusterTenantProvisioner
{
  /** Connection settings (endpoint, bearer token, advertised id). */
  private readonly config: ExternalWebhookProvisionerConfig;

  /**
   * @param config - Resolved webhook connection settings.
   */
  constructor(config: ExternalWebhookProvisionerConfig)
  {
    this.config = config;
  }

  /** Delegate provisioning to the external backend over HTTPS. */
  async provision(req: ClusterTenantProvisionRequest): Promise<ClusterTenantProvisionResult>
  {
    return this._post("provision", req);
  }

  /** Ask the external backend to tear down the customer's cluster. */
  async deprovision(name: string): Promise<void>
  {
    await this._post("deprovision", { name });
  }

  /** Read the customer's observed state from the external backend. */
  async getStatus(name: string): Promise<ClusterTenantProvisionResult>
  {
    return this._post("status", { name });
  }

  /** Resolve the kubeconfig Secret reference returned by the external backend. */
  async getKubeconfigRef(name: string): Promise<string | null>
  {
    const result = await this.getStatus(name);
    return result.kubeconfigSecretRef ?? null;
  }

  /**
   * POST a JSON action to the external webhook and parse the result envelope.
   *
   * @param action - Path segment naming the action (`provision`/`deprovision`/`status`).
   * @param payload - Vendor-neutral JSON body.
   * @returns The parsed provision result.
   */
  private async _post(action: string, payload: unknown): Promise<ClusterTenantProvisionResult>
  {
    // 1. Build the action URL under the configured base endpoint so a single
    //    backend can route provision/deprovision/status without extra config.
    const url = `${this.config.url.replace(/\/$/, "")}/${action}`;

    // 2. Present the bearer token (a documented compatibility shim — IAM/OIDC is
    //    preferred) and send the vendor-neutral request body out-of-process.
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify(payload),
    });

    // 3. Surface a non-2xx backend response as an error so the management API can
    //    fail the provision rather than persist a phantom ready boundary.
    if (!response.ok)
    {
      throw new Error(`External provisioner ${action} failed with HTTP ${response.status}`);
    }

    return (await response.json()) as ClusterTenantProvisionResult;
  }
}

/**
 * Read external-webhook provisioner settings from the environment.
 *
 * @returns A config when both URL and token are set; otherwise null (no external
 *   backend — `dedicatedCluster` stays unavailable).
 */
export function _ReadExternalWebhookConfig(): ExternalWebhookProvisionerConfig | null
{
  const url = process.env.CLUSTER_TENANT_PROVISIONER_WEBHOOK_URL?.trim();
  const token = process.env.CLUSTER_TENANT_PROVISIONER_WEBHOOK_TOKEN?.trim();
  if (!url || !token)
  {
    return null;
  }

  return { url, token, id: process.env.CLUSTER_TENANT_PROVISIONER_WEBHOOK_ID?.trim() || "external" };
}
