import * as k8s from "@kubernetes/client-node";

import { _RenderDns01ClusterIssuer, _RenderDnsCredentialsSecret } from "./cluster-issuer.js";
import type { DnsProviderConfig } from "./cluster-issuer.types.js";
import type { ApplyDnsConfigResult } from "./apply-dns-config.types.js";

/** cert-manager API group/version for the ClusterIssuer custom resource. */
const _CM_GROUP = "cert-manager.io";
const _CM_VERSION = "v1";
const _CM_ISSUER_PLURAL = "clusterissuers";

/**
 * Apply a platform DNS-provider configuration (CONN.8a).
 *
 * Idempotently upserts the cert-manager DNS credentials Secret (when a token is
 * supplied) into the cert-manager controller namespace, then upserts the ACME
 * DNS-01 `ClusterIssuer` that references it. cert-manager then issues/renews the
 * wildcard `*.<zone>` cert tenant Ingresses serve — no per-tenant issuance.
 *
 * The live cert-manager pickup (does the issued cert appear in the wildcard
 * Secret) needs a cluster + real DNS and is the CONN.8(d) e2e seam; this
 * function's job is to author the two resources correctly and apply them.
 *
 * @param customApi           - Kubernetes custom-objects client (ClusterIssuer CRD).
 * @param coreApi             - Kubernetes core client (credentials Secret).
 * @param config              - The DNS-provider configuration.
 * @param certManagerNamespace - Namespace cert-manager reads ClusterIssuer solver Secrets from.
 * @returns A summary of what was applied.
 */
export async function _ApplyPlatformDnsConfig(customApi: k8s.CustomObjectsApi,
                                              coreApi: k8s.CoreV1Api,
                                              config: DnsProviderConfig,
                                              certManagerNamespace: string): Promise<ApplyDnsConfigResult>
{
  // 1. Render + upsert the credentials Secret first (when token-based), so the
  //    ClusterIssuer solver has a Secret to reference the moment it is created.
  const secret = _RenderDnsCredentialsSecret(config, certManagerNamespace);
  if (secret)
  {
    await _UpsertSecret(coreApi, certManagerNamespace, secret.name, secret.manifest);
  }

  // 2. Render the ClusterIssuer (throws on a misconfigured provider) and upsert
  //    it; building it here means an invalid config fails before any K8s write
  //    of the issuer.
  const issuer = _RenderDns01ClusterIssuer(config, secret?.name ?? null);
  await _UpsertClusterIssuer(customApi, config.issuerName, issuer);

  return { issuerName: config.issuerName, provider: config.provider, zone: config.zone, secretName: secret?.name ?? null };
}

/**
 * Create the Secret, or replace it when it already exists (idempotent).
 * @param coreApi   - Core V1 client.
 * @param namespace - Target namespace.
 * @param name      - Secret name.
 * @param manifest  - The Secret manifest to apply.
 */
async function _UpsertSecret(coreApi: k8s.CoreV1Api, namespace: string, name: string, manifest: Record<string, unknown>): Promise<void>
{
  try
  {
    await coreApi.createNamespacedSecret({ namespace, body: manifest as unknown as k8s.V1Secret });
  }
  catch (err)
  {
    // 409 Conflict → the Secret exists; replace it so a rotated token takes effect.
    if (_IsConflict(err))
    {
      await coreApi.replaceNamespacedSecret({ name, namespace, body: manifest as unknown as k8s.V1Secret });
      return;
    }
    throw err;
  }
}

/**
 * Create the ClusterIssuer, or replace it when it already exists (idempotent).
 * @param customApi - Custom-objects client.
 * @param name      - ClusterIssuer name.
 * @param manifest  - The ClusterIssuer manifest to apply.
 */
async function _UpsertClusterIssuer(customApi: k8s.CustomObjectsApi, name: string, manifest: Record<string, unknown>): Promise<void>
{
  try
  {
    await customApi.createClusterCustomObject({ group: _CM_GROUP, version: _CM_VERSION, plural: _CM_ISSUER_PLURAL, body: manifest });
  }
  catch (err)
  {
    // 409 Conflict → exists; fetch the live resourceVersion and replace.
    if (_IsConflict(err))
    {
      const existing = await customApi.getClusterCustomObject({ group: _CM_GROUP, version: _CM_VERSION, plural: _CM_ISSUER_PLURAL, name });
      const resourceVersion = (existing as { metadata?: { resourceVersion?: string } }).metadata?.resourceVersion;
      const body = { ...manifest, metadata: { ...(manifest.metadata as Record<string, unknown>), resourceVersion } };
      await customApi.replaceClusterCustomObject({ group: _CM_GROUP, version: _CM_VERSION, plural: _CM_ISSUER_PLURAL, name, body });
      return;
    }
    throw err;
  }
}

/**
 * Detect a Kubernetes 409 Conflict (already-exists) across client error shapes.
 * @param err - The caught error.
 */
function _IsConflict(err: unknown): boolean
{
  const code = (err as { code?: number; statusCode?: number; response?: { statusCode?: number } });
  return code?.code === 409 || code?.statusCode === 409 || code?.response?.statusCode === 409;
}
