import * as k8s from "@kubernetes/client-node";

import { _log } from "../../log.js";

/**
 * Persistence seam for the platform's Zitadel service-account key, backed by the Kubernetes
 * Secret the control-plane pod mounts into `ZITADEL_MGMT_SA_KEY`. Key rotation MUST persist
 * the validated candidate here BEFORE the in-memory swap, so a pod restart keeps the new key
 * (an in-memory-only swap would silently revert to the old key on the next restart).
 *
 * Config is read from env so a misconfigured deploy fails loud, not silently in-memory-only:
 *   - `ZITADEL_MGMT_SECRET_NAME`  — the Secret carrying the SA key (REQUIRED to enable rotation).
 *   - `ZITADEL_MGMT_SECRET_KEY`   — the data key within the Secret (default `service-account-key`).
 *   - `NAMESPACE`                 — the namespace the Secret lives in (default `default`).
 */
export interface ZitadelKeySecretStore
{
  /**
   * Whether key persistence is configured (the Secret name env is set). When false the rotate
   * route must refuse (the orchestrator returns 409/501) rather than swap in-memory only.
   */
  isConfigured(): boolean;

  /**
   * Patch the validated candidate key JSON into the backing Secret (JSON-merge patch,
   * base64-encoded value). Throws on any API failure so the caller leaves the live key
   * untouched (persist-first: a failed persist means no in-memory swap).
   *
   * @param serviceAccountKeyJson - The validated candidate SA key JSON to persist.
   */
  persistKey(serviceAccountKeyJson: string): Promise<void>;
}

/** Read-only view of the resolved Secret coordinates (null name ⇒ not configured). */
interface _SecretCoordinates
{
  /** The Secret name, or null when `ZITADEL_MGMT_SECRET_NAME` is unset. */
  name: string | null;
  /** The data key within the Secret holding the SA key JSON. */
  dataKey: string;
  /** The namespace the Secret lives in. */
  namespace: string;
}

/** Resolve the Secret coordinates from the environment (live read). */
function _ReadSecretCoordinates(): _SecretCoordinates
{
  const name = process.env.ZITADEL_MGMT_SECRET_NAME?.trim() || null;
  const dataKey = process.env.ZITADEL_MGMT_SECRET_KEY?.trim() || "service-account-key";
  const namespace = process.env.NAMESPACE?.trim() || "default";
  return { name, dataKey, namespace };
}

/** Live, k8s-backed implementation of {@link ZitadelKeySecretStore}. */
export class _K8sZitadelKeySecretStore implements ZitadelKeySecretStore
{
  /** Injectable CoreV1Api (the live client in prod; a fake in tests). */
  private readonly coreApi: k8s.CoreV1Api;
  /** Resolved Secret coordinates (snapshotted at construction). */
  private readonly coords: _SecretCoordinates;

  /**
   * @param coreApi - Kubernetes Core V1 API client used to patch the Secret.
   * @param coords  - Optional pre-resolved coordinates (defaults to an env read); tests inject.
   */
  public constructor(coreApi: k8s.CoreV1Api, coords: _SecretCoordinates = _ReadSecretCoordinates())
  {
    this.coreApi = coreApi;
    this.coords = coords;
  }

  public isConfigured(): boolean
  {
    return this.coords.name !== null;
  }

  public async persistKey(serviceAccountKeyJson: string): Promise<void>
  {
    // 1. Refuse loud when unconfigured — the caller must have checked isConfigured(); this is
    //    the defence-in-depth guard so a misconfigured deploy can never persist nowhere.
    if (this.coords.name === null)
    {
      throw new Error("ZITADEL_MGMT_SECRET_NAME is not set; cannot persist the rotated key");
    }

    // 2. JSON-merge-patch the single data key (base64-encoded). A merge patch leaves every
    //    other key in the Secret intact, so a Secret carrying more than the SA key is safe.
    const body = { data: { [this.coords.dataKey]: Buffer.from(serviceAccountKeyJson, "utf8").toString("base64") } };
    await this.coreApi.patchNamespacedSecret(
      { name: this.coords.name, namespace: this.coords.namespace, body },
      k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch),
    );
    _log.info({ secretName: this.coords.name, namespace: this.coords.namespace, dataKey: this.coords.dataKey }, "zitadel key rotation: persisted rotated key to backing Secret");
  }
}

/**
 * Build the live k8s-backed key-secret store. Always returns a store; whether persistence is
 * actually configured is exposed via `isConfigured()` so the rotate route can fail loud
 * (409/501) on a misconfigured deploy rather than swap in-memory only.
 *
 * @param coreApi - Kubernetes Core V1 API client used to patch the Secret.
 */
export function _BuildZitadelKeySecretStore(coreApi: k8s.CoreV1Api): ZitadelKeySecretStore
{
  return new _K8sZitadelKeySecretStore(coreApi);
}
