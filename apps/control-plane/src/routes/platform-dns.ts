import { Router } from "express";
import * as k8s from "@kubernetes/client-node";

import { _ApplyPlatformDnsConfig } from "../core/platform-dns/apply-dns-config.js";
import { _DnsProviderConfigError } from "../core/platform-dns/cluster-issuer.js";
import type { PlatformDnsStatus } from "./platform-dns.types.js";

/** Default ClusterIssuer name when the request omits one. */
const _DEFAULT_ISSUER_NAME = "opencrane-issuer";

/** cert-manager API coordinates for reading the ClusterIssuer back. */
const _CM_GROUP = "cert-manager.io";
const _CM_VERSION = "v1";
const _CM_ISSUER_PLURAL = "clusterissuers";

/**
 * Onboarding router for platform TLS/DNS issuance (CONN.8a).
 *
 * `PUT /` captures a DNS-provider config and applies the cert-manager DNS-01
 * `ClusterIssuer` (+ credentials Secret) that issues the wildcard tenant cert;
 * `GET /` reports the currently configured issuer. Mounted under
 * `/api/v1/platform/dns` behind `___AuthMiddleware` — a platform-admin surface.
 *
 * @param customApi - Kubernetes custom-objects client (ClusterIssuer CRD).
 * @param coreApi   - Kubernetes core client (credentials Secret).
 * @returns Configured Express router.
 */
export function platformDnsRouter(customApi: k8s.CustomObjectsApi, coreApi: k8s.CoreV1Api): Router
{
  const router = Router();
  const certManagerNamespace = process.env.CERT_MANAGER_NAMESPACE ?? "cert-manager";

  /** Configure (create/update) the platform DNS-01 ClusterIssuer. */
  router.put("/", async function _setDns(req, res, next)
  {
    try
    {
      const provider = typeof req.body?.provider === "string" ? req.body.provider.trim() : "";
      const zone = typeof req.body?.zone === "string" ? req.body.zone.trim() : "";
      const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

      // 1. Require the three fields the ACME DNS-01 issuer cannot be built without.
      if (provider.length === 0 || zone.length === 0 || email.length === 0)
      {
        res.status(400).json({ error: "provider, zone and email are required", code: "VALIDATION_ERROR" });
        return;
      }

      // 2. Apply the issuer + Secret. A misconfigured provider (no token and no
      //    solverConfig) throws synchronously inside the render → surfaced as 422.
      const result = await _ApplyPlatformDnsConfig(customApi, coreApi, {
        provider,
        zone,
        email,
        server: typeof req.body?.server === "string" ? req.body.server.trim() : undefined,
        issuerName: typeof req.body?.issuerName === "string" && req.body.issuerName.trim().length > 0 ? req.body.issuerName.trim() : _DEFAULT_ISSUER_NAME,
        apiToken: typeof req.body?.apiToken === "string" ? req.body.apiToken : undefined,
        solverConfig: typeof req.body?.solverConfig === "object" && req.body.solverConfig !== null ? req.body.solverConfig : undefined,
      }, certManagerNamespace);

      res.json({ status: "configured", ...result });
    }
    catch (err)
    {
      // A render-time provider misconfiguration is a client error, not a 500.
      if (err instanceof _DnsProviderConfigError)
      {
        res.status(422).json({ error: err.message, code: "DNS_PROVIDER_MISCONFIGURED" });
        return;
      }
      next(err);
    }
  });

  /** Report the currently configured platform DNS issuer. */
  router.get("/", async function _showDns(req, res, next)
  {
    try
    {
      const issuerName = typeof req.query.issuerName === "string" && req.query.issuerName.length > 0 ? req.query.issuerName : _DEFAULT_ISSUER_NAME;

      let issuer: unknown;
      try
      {
        issuer = await customApi.getClusterCustomObject({ group: _CM_GROUP, version: _CM_VERSION, plural: _CM_ISSUER_PLURAL, name: issuerName });
      }
      catch (lookupErr)
      {
        // Only a 404 (issuer absent / cert-manager CRD not installed) means
        // "unconfigured" — propagate auth/permission/server errors instead of
        // masking them as a clean not-configured response.
        if (_IsNotFound(lookupErr))
        {
          res.json({ configured: false, issuerName, provider: null, email: null, server: null } satisfies PlatformDnsStatus);
          return;
        }
        throw lookupErr;
      }

      res.json(_SummariseIssuer(issuer, issuerName));
    }
    catch (err)
    {
      next(err);
    }
  });

  return router;
}

/**
 * Detect a Kubernetes 404 Not Found across the client's error shapes.
 * @param err - The caught error.
 */
function _IsNotFound(err: unknown): boolean
{
  const e = err as { code?: number; statusCode?: number; response?: { statusCode?: number } };
  return e?.code === 404 || e?.statusCode === 404 || e?.response?.statusCode === 404;
}

/**
 * Extract a non-secret status summary from a ClusterIssuer custom resource.
 * @param issuer     - The raw ClusterIssuer object.
 * @param issuerName - The issuer name queried.
 */
function _SummariseIssuer(issuer: unknown, issuerName: string): PlatformDnsStatus
{
  const acme = (issuer as { spec?: { acme?: { email?: string; server?: string; solvers?: Array<{ dns01?: Record<string, unknown> }> } } }).spec?.acme;
  const dns01 = acme?.solvers?.[0]?.dns01 ?? {};
  // The provider is the single key of the dns01 solver block (e.g. `cloudflare`).
  const provider = Object.keys(dns01).find(function _notType(key) { return key !== "cnameStrategy"; }) ?? null;
  return {
    configured: true,
    issuerName,
    provider,
    email: acme?.email ?? null,
    server: acme?.server ?? null,
  };
}
