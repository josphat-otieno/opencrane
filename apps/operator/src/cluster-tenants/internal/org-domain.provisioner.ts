import { _BuildOrgDomain, _BuildOrgWildcard } from "@opencrane/contracts";

import type { OrgDomainProvisioner, OrgDomainProvisionRequest, OrgDomainProvisionResult, OrgDomainProvisionerConfig, CertManagerOperations, CloudDnsOperations } from "./org-domain-provisioner.types.js";

/** TTL (seconds) for the per-org A records — matches the terraform DNS module. */
const _RECORD_TTL = 300;

/**
 * Concrete {@link OrgDomainProvisioner} for the fixed-wildcard topology, owned by the
 * operator (the reconciler/executor). Given an org, it materialises the two cluster-
 * side side effects the topology requires:
 *
 *   1. A per-org wildcard TLS Certificate `*.<org>.<base>` (+ the `<org>.<base>` apex
 *      SAN, and the vanity domain when present) via cert-manager DNS-01, into the org's
 *      bound namespace — because the platform `*.<base>` cert does NOT cover the extra
 *      label `<user>.<org>.<base>`.
 *   2. A per-org serving DNS record `*.<org>.<base>` (and the `<org>.<base>` apex) →
 *      the cluster ingress IP, via the terraform-managed Cloud DNS zone — so every
 *      UserTenant gateway host under the org resolves with no per-user record.
 *
 * Both side effects are idempotent (re-apply is a no-op) so the reconciler can call
 * `provisionOrgDomain` on every reconcile. It is RUNTIME-GATED by real capability
 * detection, NOT a hardcoded always-skip: the Certificate manifest is genuinely built
 * and the apply IS issued; only an absent Certificate CRD short-circuits the TLS side
 * (fail-closed), and the DNS side runs only when a Cloud DNS client + ingress IP are
 * present. When NEITHER side could act (cert-manager absent AND no DNS target), it
 * returns `{ ready:false, skipped:true }` so the reconciler records the skip and the
 * org still reaches `ready` — it never throws.
 *
 * PRECONDITION: the org's bound namespace (`<namespacePrefix><org>`) must already
 * exist — the reconciler fences it BEFORE calling this. A missing namespace is a
 * precondition fault: the cert-manager client re-throws that 404 (it is NOT masked as
 * "cert-manager absent"), so the reconciler surfaces it as an error.
 */
export class DefaultOrgDomainProvisioner implements OrgDomainProvisioner
{
  /** cert-manager Certificate operations (injected; fake in tests). */
  private readonly certs: CertManagerOperations;

  /**
   * Cloud DNS record operations, or null when no managed zone is configured. Null
   * means the install is not on a Cloud DNS substrate, so the DNS side effect is
   * skipped (the Certificate is still applied).
   */
  private readonly dns: CloudDnsOperations | null;

  /** Static issuer + namespace config from the chart values. */
  private readonly config: OrgDomainProvisionerConfig;

  /**
   * @param certs  - cert-manager Certificate operations.
   * @param dns    - Cloud DNS record operations, or null when no zone is configured.
   * @param config - Issuer name/kind + namespace prefix from the chart values.
   */
  public constructor(certs: CertManagerOperations, dns: CloudDnsOperations | null, config: OrgDomainProvisionerConfig)
  {
    this.certs = certs;
    this.dns = dns;
    this.config = config;
  }

  /** @inheritdoc */
  public async provisionOrgDomain(req: OrgDomainProvisionRequest): Promise<OrgDomainProvisionResult>
  {
    const orgDomain = _BuildOrgDomain(req.orgName, req.platformBaseDomain);
    const wildcardDnsName = _BuildOrgWildcard(orgDomain); // `*.<org>.<base>`
    const namespace = `${this.config.namespacePrefix}${req.orgName}`;
    const tlsSecretName = `org-wildcard-tls-${req.orgName}`;

    // 1. DNS first — the wildcard A record `*.<org>.<base>` and the org apex, both →
    //    the ingress IP. Runs only when a Cloud DNS client AND an ingress IP target are
    //    present; otherwise the install is not on a DNS substrate and the step is
    //    skipped. Idempotent. dnsApplied records whether the DNS side actually acted.
    const dnsApplied = await this._ensureDnsRecords(req, orgDomain, wildcardDnsName);

    // 2. The per-org wildcard Certificate. The manifest is genuinely built and the
    //    apply IS issued; the client returns certManagerInstalled:false (fail-closed,
    //    no crash) only when the cluster has no Certificate CRD.
    const certificate = this._buildCertificate(req, orgDomain, wildcardDnsName, namespace, tlsSecretName);
    const readiness = await this.certs.applyCertificate(namespace, certificate);

    // 3. Gate on REAL capability signals: when cert-manager is absent AND no DNS record
    //    was applied, no backend acted at all → report skipped so the reconciler records
    //    the condition and the org still reaches ready. Otherwise the step is live and
    //    `ready` reflects whether DNS-01 issuance has completed.
    if (!readiness.certManagerInstalled && !dnsApplied)
    {
      return {
        orgDomain,
        wildcardDnsName,
        tlsSecretName,
        ready: false,
        skipped: true,
        message: readiness.reason ?? "cert-manager and Cloud DNS are both unavailable; per-org wildcard cert + DNS record not provisioned",
      };
    }

    return {
      orgDomain,
      wildcardDnsName,
      tlsSecretName,
      ready: readiness.ready,
      skipped: false,
      message: readiness.ready ? undefined : readiness.reason,
    };
  }

  /** @inheritdoc */
  public async deprovisionOrgDomain(orgName: string, platformBaseDomain: string): Promise<void>
  {
    const orgDomain = _BuildOrgDomain(orgName, platformBaseDomain);
    const wildcardDnsName = _BuildOrgWildcard(orgDomain);
    const namespace = `${this.config.namespacePrefix}${orgName}`;
    const tlsSecretName = `org-wildcard-tls-${orgName}`;

    // 1. Delete the Certificate first — missing Certificate / CRD are no-ops.
    await this.certs.deleteCertificate(namespace, tlsSecretName);

    // 2. Delete the serving DNS records when a zone is configured — absence is a no-op.
    if (this.dns)
    {
      await this.dns.deleteARecord(wildcardDnsName);
      await this.dns.deleteARecord(orgDomain);
    }
  }

  /**
   * Ensure the per-org wildcard AND apex A records point at the ingress IP, when a
   * Cloud DNS client and an ingress IP are both available. Returns whether the DNS
   * side effect actually ran, so the caller can distinguish a real no-backend skip
   * from a partially-served reconcile.
   *
   * @param req             - The provision request (carries the optional ingress IP).
   * @param orgDomain       - The org apex `<org>.<base>`.
   * @param wildcardDnsName - The per-org wildcard `*.<org>.<base>`.
   * @returns True when both A records were ensured; false when DNS was skipped.
   */
  private async _ensureDnsRecords(req: OrgDomainProvisionRequest, orgDomain: string, wildcardDnsName: string): Promise<boolean>
  {
    const ingressIp = req.ingressIp?.trim();
    if (!this.dns || !ingressIp)
    {
      return false;
    }

    await this.dns.ensureARecord(wildcardDnsName, [ingressIp], _RECORD_TTL);
    await this.dns.ensureARecord(orgDomain, [ingressIp], _RECORD_TTL);
    return true;
  }

  /**
   * Build the per-org wildcard Certificate CR — `*.<org>.<base>` + the `<org>.<base>`
   * apex SAN, the org's vanity domain (and its wildcard) appended when set, the
   * configured issuer ref, and the per-org TLS Secret name.
   *
   * @param req             - The provision request (carries the optional vanity domain).
   * @param orgDomain       - The org apex `<org>.<base>`.
   * @param wildcardDnsName - The per-org wildcard `*.<org>.<base>`.
   * @param namespace       - The org's bound namespace the Certificate is created in.
   * @param tlsSecretName   - The per-org TLS Secret name (also the Certificate name).
   * @returns The Certificate custom-resource manifest.
   */
  private _buildCertificate(req: OrgDomainProvisionRequest, orgDomain: string, wildcardDnsName: string, namespace: string, tlsSecretName: string): Record<string, unknown>
  {
    const dnsNames: string[] = [wildcardDnsName, orgDomain];
    const vanity = req.vanityDomain?.trim();
    if (vanity)
    {
      // The customer CNAMEs the vanity onto <org>.<base>; add it (and its wildcard)
      // so the org is browser-trusted under the vanity name too.
      dnsNames.push(_BuildOrgWildcard(vanity), vanity);
    }

    return {
      apiVersion: "cert-manager.io/v1",
      kind: "Certificate",
      metadata: {
        name: tlsSecretName,
        namespace,
        labels: {
          "app.kubernetes.io/part-of": "opencrane",
          "app.kubernetes.io/component": "org-wildcard-cert",
          "opencrane.io/cluster-tenant": req.orgName,
        },
      },
      spec: {
        secretName: tlsSecretName,
        issuerRef: {
          name: this.config.issuerName,
          kind: this.config.issuerKind,
        },
        dnsNames,
      },
    };
  }
}
