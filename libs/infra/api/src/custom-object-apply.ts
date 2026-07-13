import type * as k8s from "@kubernetes/client-node";

/** Address of a single namespaced custom resource + the manifest to write. */
export interface CustomObjectRef
{
  /** API group, e.g. `cert-manager.io`. */
  group: string;
  /** API version, e.g. `v1`. */
  version: string;
  /** Namespace the object lives in. */
  namespace: string;
  /** Plural resource name, e.g. `certificates`. */
  plural: string;
  /** Object name. */
  name: string;
  /** Desired manifest (its `metadata.resourceVersion` is overwritten with the live one). */
  manifest: Record<string, unknown>;
}

/**
 * Replace a namespaced custom resource in place, carrying the LIVE resourceVersion.
 *
 * The canonical "create-then-replace-on-409" idempotent apply for custom resources: on a 409
 * (already exists) the caller calls this to GET the live object, copy its
 * `metadata.resourceVersion` onto the desired manifest, and `replace` — converging without the
 * content-type pitfalls of a merge-patch. Both managers drive cert-manager Certificates,
 * external-dns DNSEndpoints, cert-manager Issuers, and Linkerd policy CRs through this exact
 * dance, so it lives here in `@opencrane/infra-api` to be defined once.
 *
 * The caller owns the create + error-classification (404-absent-CRD vs 409-conflict, via the
 * `_IsConflict`/`_IsCrdAbsent` helpers); this is only the 409 → replace tail.
 *
 * @param customApi - Custom Objects API client.
 * @param ref       - The object address + the manifest to write.
 * @returns The API response from the replace call.
 */
export async function __ReplaceCustomObjectWithLiveVersion(
  customApi: k8s.CustomObjectsApi,
  ref: CustomObjectRef,
): Promise<unknown>
{
  const { group, version, namespace, plural, name, manifest } = ref;

  const existing = await customApi.getNamespacedCustomObject({ group, version, namespace, plural, name });
  const resourceVersion = (existing as { metadata?: { resourceVersion?: string } }).metadata?.resourceVersion;
  const body = { ...manifest, metadata: { ...(manifest.metadata as Record<string, unknown>), resourceVersion } };

  return customApi.replaceNamespacedCustomObject({ group, version, namespace, plural, name, body });
}
