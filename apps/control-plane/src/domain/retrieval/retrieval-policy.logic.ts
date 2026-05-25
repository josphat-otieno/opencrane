import type * as k8s from "@kubernetes/client-node";

import { OPENCRANE_API_GROUP, OPENCRANE_API_VERSION, POLICY_CRD_PLURAL, TENANT_CRD_PLURAL } from "../../routes/internal/crd-constants.js";

/**
 * Resolve the effective AccessPolicy name for a tenant from its CRD spec.
 * Returns null when no policy is configured or the CRD cannot be read.
 */
export async function _ResolveTenantPolicyName(
  customApi: k8s.CustomObjectsApi,
  tenantName: string,
  namespace: string,
): Promise<string | null>
{
  try
  {
    const response = await customApi.getNamespacedCustomObject({
      group: OPENCRANE_API_GROUP,
      version: OPENCRANE_API_VERSION,
      namespace,
      plural: TENANT_CRD_PLURAL,
      name: tenantName,
    }) as { spec?: { policyRef?: string } };

    return response?.spec?.policyRef ?? null;
  }
  catch
  {
    return null;
  }
}

/**
 * Determine whether the resolved AccessPolicy blocks retrieval access.
 *
 * A retrieval request is denied when:
 * - The policy explicitly denies the "retrieval" MCP server name, OR
 * - The policy has an allow list that does not include "retrieval".
 *
 * When no policy is found or the policy has no mcpServers config, retrieval is allowed.
 */
export async function _CheckRetrievalPolicyDenied(
  customApi: k8s.CustomObjectsApi,
  policyName: string | null,
  namespace: string,
): Promise<boolean>
{
  if (!policyName)
  {
    return false;
  }

  try
  {
    const response = await customApi.getNamespacedCustomObject({
      group: OPENCRANE_API_GROUP,
      version: OPENCRANE_API_VERSION,
      namespace,
      plural: POLICY_CRD_PLURAL,
      name: policyName,
    }) as { spec?: { mcpServers?: { allow?: string[]; deny?: string[] } } };

    const mcpServers = response?.spec?.mcpServers;
    if (!mcpServers)
    {
      return false;
    }

    // Explicit deny list takes precedence over allow list.
    const denyList = mcpServers.deny ?? [];
    if (denyList.includes("retrieval"))
    {
      return true;
    }

    // Allow list present and does not include "retrieval" → deny.
    const allowList = mcpServers.allow;
    if (allowList && allowList.length > 0 && !allowList.includes("retrieval"))
    {
      return true;
    }

    return false;
  }
  catch
  {
    // Policy lookup failure defaults to allow to avoid blocking queries
    // on transient Kubernetes API errors.
    return false;
  }
}
