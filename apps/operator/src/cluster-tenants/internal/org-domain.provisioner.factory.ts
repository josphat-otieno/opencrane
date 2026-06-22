import type * as k8s from "@kubernetes/client-node";

import type { OpenClawTenantOperatorConfig } from "../../config.js";
import { CertManagerClient } from "./cert-manager.client.js";
import { CloudDnsClient } from "./cloud-dns.client.js";
import { DefaultOrgDomainProvisioner } from "./org-domain.provisioner.js";
import type { OrgDomainProvisioner, CloudDnsOperations } from "./org-domain-provisioner.types.js";

/**
 * Build the concrete {@link OrgDomainProvisioner} from the operator config, wiring the
 * real cert-manager (custom-objects) client and — when a Cloud DNS managed zone is
 * configured — the real Cloud DNS client.
 *
 * The cert-manager client is ALWAYS wired: it detects an absent Certificate CRD at
 * runtime (fail-closed) rather than at construction, so the dev cluster (no cert-
 * manager) still gets a real provisioner that skips gracefully. The Cloud DNS client
 * is wired only when both a GCP project and a managed zone are present; otherwise the
 * install is not on a Cloud DNS substrate and the DNS side effect is skipped (null
 * client) — the provisioner reports the skip rather than crashing.
 *
 * @param customApi - Kubernetes custom-objects client (Certificate CRDs).
 * @param config - Operator runtime configuration.
 * @returns A wired provisioner; the DNS client is null when no managed zone is set.
 */
export function _BuildOrgDomainProvisioner(customApi: k8s.CustomObjectsApi, config: OpenClawTenantOperatorConfig): OrgDomainProvisioner
{
  // 1. Cloud DNS is optional — wire it only when a GCP project AND managed zone are
  //    present, otherwise the install has no DNS substrate and the DNS step skips.
  const projectId = config.gcp?.projectId?.trim();
  const managedZone = config.dnsManagedZone?.trim();
  const dns: CloudDnsOperations | null = projectId && managedZone
    ? new CloudDnsClient(projectId, managedZone)
    : null;

  // 2. cert-manager is always wired — CRD absence is a runtime signal, not a wiring
  //    decision — so the provisioner is real even on a cluster without cert-manager.
  return new DefaultOrgDomainProvisioner(
    new CertManagerClient(customApi),
    dns,
    {
      issuerName: config.certManagerIssuerName,
      issuerKind: config.certManagerIssuerKind,
      namespacePrefix: config.clusterTenantNamespacePrefix,
    },
  );
}
