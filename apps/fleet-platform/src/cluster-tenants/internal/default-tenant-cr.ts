import * as k8s from "@kubernetes/client-node";
import type { Logger } from "pino";

import { OPENCRANE_API_GROUP, OPENCRANE_API_VERSION, TENANT_CRD_PLURAL, _IsK8sConflict } from "@opencrane/infra-api";

/** Suffix appended to an org name to form its first workspace Tenant's name. */
export const _DEFAULT_TENANT_SUFFIX = "-default";

/**
 * Ensure an org's first workspace Tenant CRD (`<org>-default`, attributed to the owner) exists
 * in the org's bound namespace, once the ClusterTenant has reconciled to `ready`.
 *
 * This is the fleet-manager half of the default-workspace projection (Option A): the fleet
 * registry has no `Tenant` table, so the operator creates only the **CRD** — the TenantOperator
 * then reconciles it into a running openclaw, and the silo projects the CRD into its own DB (the
 * Tenant projection-repair path) so the workspace appears in the silo's management API.
 *
 * Idempotent and fail-soft:
 *  - tolerates a pre-existing CRD (409 AlreadyExists) — a re-reconcile is a no-op;
 *  - a contact email is REQUIRED (the Tenant contract cannot compile without one), so an owner
 *    carrying only a subject (the dev-auth path) is skipped with a warning rather than seeding an
 *    email-less workspace; the org still reaches `ready`;
 *  - any create failure is logged and swallowed — the org is already `ready`, and a seed hiccup
 *    must never fail the reconcile (a later reconcile retries).
 *
 * @param opts.customApi      - Custom-objects client (the operator's), used to create the CRD.
 * @param opts.log            - Scoped logger.
 * @param opts.namespace      - The org's bound namespace the Tenant CRD lives in.
 * @param opts.orgName        - The ClusterTenant (org) name; the Tenant is `<orgName>-default`.
 * @param opts.orgDisplayName - Human-readable org name; the workspace display name derives from it.
 * @param opts.owner          - The org owner's `{subject, email}` from the CR spec (may be partial).
 */
export async function _EnsureOwnerDefaultTenantCr(opts: {
  customApi: k8s.CustomObjectsApi;
  log: Logger;
  namespace: string;
  orgName: string;
  orgDisplayName: string;
  owner: { subject?: string; email?: string } | undefined;
}): Promise<void>
{
  const { customApi, log, namespace, orgName, orgDisplayName, owner } = opts;
  const tenantName = `${orgName}${_DEFAULT_TENANT_SUFFIX}`;

  const email = owner?.email?.trim() ?? "";
  if (!email)
  {
    // No contact email on the CR (dev-auth carries only a subject) → the Tenant contract
    // cannot compile, so skip rather than seed an email-less workspace. The org is still ready.
    log.warn({ orgName, tenantName }, "default workspace Tenant not seeded: org owner has no email on the ClusterTenant CR");
    return;
  }
  const subject = owner?.subject?.trim() || "";
  const displayName = `${orgDisplayName} workspace`;

  try
  {
    await customApi.createNamespacedCustomObject({
      group: OPENCRANE_API_GROUP, version: OPENCRANE_API_VERSION, namespace, plural: TENANT_CRD_PLURAL,
      body: {
        apiVersion: `${OPENCRANE_API_GROUP}/${OPENCRANE_API_VERSION}`,
        kind: "Tenant",
        metadata: { name: tenantName, namespace },
        spec: { displayName, email, clusterTenantRef: orgName, ...(subject ? { subject } : {}) },
      },
    });
    log.info({ orgName, tenantName, namespace }, "seeded owner's default workspace Tenant CRD");
  }
  catch (err)
  {
    // Already seeded — the desired end state; treat as a no-op (idempotent re-reconcile).
    if (_IsK8sConflict(err)) return;
    // A seed failure must not fail the org reconcile (the org is already ready); a later
    // reconcile retries. Warn so the missing workspace surfaces.
    log.warn({ err, orgName, tenantName }, "default workspace Tenant CRD create failed; org stays ready (re-run to retry)");
  }
}
