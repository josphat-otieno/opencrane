import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";

import * as k8s from "@kubernetes/client-node";
import type { Logger } from "pino";

import type { OpenClawTenantOperatorConfig } from "../../config.js";
import { __K8sApplyResource } from "@opencrane/infra-api";
import { _BuildTenantLabels } from "../deploy/tenant-labels.js";
import type { Tenant } from "../models/tenant.interface.js";

/**
 * Provisions a REAL, per-openclaw-tenant Cognee user account — the tenant's pod
 * authenticates to Cognee AS THE TENANT'S OWNER, never as a shared/default identity.
 *
 * Why this exists: Cognee's `ENABLE_BACKEND_ACCESS_CONTROL` defaults on, so every request
 * needs a real user session. Left unconfigured, the official `@cognee/cognee-openclaw`
 * plugin (verified against the shipped package's `client.js`: `login()`) falls back to
 * Cognee's hardcoded default account (`default_user@example.com` / `default_password`) —
 * every tenant in the silo would then share ONE Cognee identity, which both defeats
 * Cognee's own per-user dataset access control (the actual enforcement the plugin's
 * multi-scope config in `_BuildConfigMap` relies on) and means a single well-known
 * credential exposes every tenant's memory (worse given the unpatched
 * topoteretes/cognee#3084 self-registration bug — see PR #178's egress mitigation).
 *
 * This registers the tenant's OWNER EMAIL — the SAME identity the gateway's trusted-proxy
 * `allowUsers` allowlist already pins the pod to (`_BuildConfigMap`'s `ownerEmail`), i.e.
 * the actual login the tenant's user authenticates with — as a real Cognee account with a
 * per-tenant password. `2-config-map.ts` deliberately renders NO `apiKey`/`username`/
 * `password` into the plugin's config (never put a real password into a ConfigMap); the
 * plugin falls back to reading `COGNEE_USERNAME`/`COGNEE_PASSWORD` from the pod's own
 * environment instead (verified in the shipped plugin's `config.js`), which
 * `_BuildDeployment` populates via `secretKeyRef` from the Secret this class writes. From
 * there the plugin manages its own JWT login/re-login (verified in `client.js`: it lazily
 * logs in on first request and transparently re-authenticates on a 401) — the operator
 * never has to track a token lifecycle.
 *
 * The password is NOT freshly `randomBytes`-generated on every reconcile — it is derived
 * deterministically (HMAC-SHA256) from the tenant's own encryption key (already minted by
 * `TenantEncryptionKeys` one reconcile step earlier). This makes registration crash-safe:
 * if the operator dies between the register call and writing this Secret, the next
 * reconcile derives the IDENTICAL password and retries — Cognee's register endpoint
 * returns 400 for a duplicate email, treated here as success, so the retry converges on
 * the correct credential instead of leaving an unrecoverable password mismatch.
 */
export class CogneeTenantIdentity
{
  private config: OpenClawTenantOperatorConfig;
  private coreApi: k8s.CoreV1Api;
  private objectApi: k8s.KubernetesObjectApi;
  private log: Logger;

  constructor(
    config: OpenClawTenantOperatorConfig,
    coreApi: k8s.CoreV1Api,
    objectApi: k8s.KubernetesObjectApi,
    log: Logger,
  )
  {
    this.config = config;
    this.coreApi = coreApi;
    this.objectApi = objectApi;
    this.log = log;
  }

  /**
   * Ensure the tenant has a real, dedicated Cognee login. No-ops when Cognee is not
   * configured for this silo, or when the tenant's credentials Secret already exists —
   * the login is minted once and never rotated (mirrors `TenantEncryptionKeys`).
   *
   * @param tenant - The Tenant CR being reconciled. Requires its encryption key Secret
   *        (`openclaw-<name>-encryption-key`) to already exist — call after
   *        `TenantEncryptionKeys.ensureEncryptionKeySecret` in the same reconcile pass.
   * @param namespace - Namespace the credentials Secret is written to.
   */
  async ensureTenantCogneeIdentity(tenant: Tenant, namespace: string): Promise<void>
  {
    if (!this.config.cogneeEndpoint)
    {
      return;
    }

    const name = tenant.metadata!.name!;
    const secretName = _CredentialsSecretName(name);

    // 1. Idempotency check — a tenant's Cognee login, once minted, is never rotated.
    try
    {
      await this.coreApi.readNamespacedSecret({ name: secretName, namespace });
      this.log.debug({ name, secretName }, "cognee tenant identity already exists");
      return;
    }
    catch
    {
      // Secret does not exist — continue to registration.
    }

    // 2. Derive the login. Email is the SAME identity the gateway's trusted-proxy
    //    allowlist already pins the pod to (`_BuildConfigMap`'s `ownerEmail`) — "the user
    //    login" the tenant's owner actually authenticates with. `subject` (an opaque OIDC
    //    `sub`) is deliberately NOT used here: Cognee validates `email` as a real email
    //    address and would reject a non-email subject string.
    const email = tenant.spec.email.trim().toLowerCase();
    const password = await this._deriveTenantPassword(name, namespace, email);

    // 3. Register with Cognee. A 400 almost always means the email is already registered
    //    (e.g. a prior reconcile crashed before step 4 wrote the Secret) — since the
    //    password is derived deterministically, retrying with the identical password
    //    converges correctly either way, so both outcomes proceed to step 4.
    await this._registerCogneeUser(email, password, name);

    // 4. Persist the login as a per-tenant Secret. `_BuildDeployment` mounts `username`/
    //    `password` as COGNEE_USERNAME/COGNEE_PASSWORD env vars (secretKeyRef); the plugin
    //    reads those directly since `2-config-map.ts` renders no username/password/apiKey.
    const secret: k8s.V1Secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: secretName,
        namespace,
        labels: _BuildTenantLabels(name),
      },
      type: "Opaque",
      data: {
        username: Buffer.from(email).toString("base64"),
        password: Buffer.from(password).toString("base64"),
      },
    };

    await __K8sApplyResource(this.objectApi, secret, this.log);
    this.log.info({ name, secretName, email }, "created cognee tenant identity");
  }

  /**
   * Register `email`/`password` as a Cognee user. Idempotent: a 400 response (Cognee's
   * signal for "email already registered", verified against the shipped `test_backend_auth.py`:
   * `assert register_response.status_code in (201, 400)`) is treated as success since the
   * password is derived deterministically and will match whatever was registered previously.
   */
  private async _registerCogneeUser(email: string, password: string, tenantName: string): Promise<void>
  {
    const response = await fetch(`${this.config.cogneeEndpoint}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok)
    {
      return;
    }

    if (response.status === 400)
    {
      const body = await response.text();
      this.log.info({ tenantName, email, body }, "cognee user already registered; adopting existing account");
      return;
    }

    const body = await response.text();
    throw new Error(`Cognee user registration failed for ${tenantName} (${response.status}): ${body}`);
  }

  /**
   * Derive a stable per-tenant Cognee password from the tenant's own encryption key
   * (already minted by `TenantEncryptionKeys` earlier in the same reconcile pass), so a
   * retry after a partial failure (see class doc comment) always reproduces the same value.
   */
  private async _deriveTenantPassword(tenantName: string, namespace: string, email: string): Promise<string>
  {
    const encryptionKeySecretName = `openclaw-${tenantName}-encryption-key`;
    const encryptionKeySecret = await this.coreApi.readNamespacedSecret({ name: encryptionKeySecretName, namespace });
    const encoded = encryptionKeySecret.data?.["key"];
    if (!encoded)
    {
      throw new Error(`${encryptionKeySecretName} Secret has no "key" field — cannot derive a stable cognee password`);
    }

    const keyBytes = Buffer.from(encoded, "base64");
    return createHmac("sha256", keyBytes).update(`cognee-tenant-identity-v1:${email}`).digest("base64url");
  }
}

/**
 * The per-tenant Secret name carrying this tenant's Cognee login (`username`/`password`
 * fields), consumed by `_BuildDeployment` (COGNEE_USERNAME/COGNEE_PASSWORD env vars).
 */
export function _CredentialsSecretName(tenantName: string): string
{
  return `openclaw-${tenantName}-cognee-credentials`;
}
