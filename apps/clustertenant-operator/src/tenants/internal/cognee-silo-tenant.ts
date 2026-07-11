import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";

import * as k8s from "@kubernetes/client-node";
import type { Logger } from "pino";

import type { OpenClawTenantOperatorConfig } from "../../config.js";
import { __K8sApplyResource } from "@opencrane/infra-api";

/**
 * Fixed Secret name carrying the silo's Cognee OWNER login (`username`/`password`) and the
 * Cognee Tenant it owns (`tenantId`). Fixed, not release-prefixed, for the same reason as
 * {@link import("./cognee-litellm-key.js").COGNEE_LITELLM_KEY_SECRET_NAME}: there is exactly
 * one Cognee instance per silo/namespace, so exactly one owner.
 */
export const COGNEE_SILO_OWNER_SECRET_NAME = "cognee-silo-owner";

/** Fixed email for the silo's Cognee owner account (each silo's Cognee is a wholly separate server/user-db). */
const _OWNER_EMAIL = "silo-owner@opencrane.internal";

/** Decoded shape persisted in the {@link COGNEE_SILO_OWNER_SECRET_NAME} Secret. */
export interface CogneeSiloOwnerState
{
  username: string;
  password: string;
  /** Empty until the Cognee Tenant has been created/resolved (see {@link CogneeSiloTenant.ensureSiloTenant}). */
  tenantId: string;
}

/**
 * Read the silo owner's Cognee login + resolved Tenant id, or `undefined` when the Secret
 * doesn't exist yet. Shared with `CogneeTenantIdentity.ensureTenantJoinedToSiloTenant`, which
 * needs the owner's credentials to add each per-tenant login to the silo's Cognee Tenant.
 */
export async function _ReadSiloOwnerState(coreApi: k8s.CoreV1Api, namespace: string): Promise<CogneeSiloOwnerState | undefined>
{
  try
  {
    const secret = await coreApi.readNamespacedSecret({ name: COGNEE_SILO_OWNER_SECRET_NAME, namespace });
    const data = secret.data ?? {};
    const username = data["username"] ? Buffer.from(data["username"], "base64").toString("utf8") : "";
    const password = data["password"] ? Buffer.from(data["password"], "base64").toString("utf8") : "";
    const tenantId = data["tenantId"] ? Buffer.from(data["tenantId"], "base64").toString("utf8") : "";
    if (!username || !password)
    {
      throw new Error(`${COGNEE_SILO_OWNER_SECRET_NAME} Secret is missing username/password`);
    }

    return { username, password, tenantId };
  }
  catch
  {
    return undefined;
  }
}

/**
 * Provisions ONE Cognee "owner" account + ONE Cognee Tenant per silo — the grouping every
 * per-openclaw-tenant Cognee login (see `CogneeTenantIdentity`) joins so the plugin's
 * `companyDataset` scope is actually SHARED across every openclaw tenant in the silo,
 * rather than silently becoming a separate private dataset per tenant.
 *
 * Why this exists: Cognee's own dataset-access resolution
 * (`get_all_user_permission_datasets` in the shipped server) unions a user's OWN ACLs with
 * their Cognee-TENANT's ACLs, then filters to `dataset.tenant_id == user.tenant_id` — a
 * freshly `register`-ed user (see `CogneeTenantIdentity`) has `tenant_id = NULL`, so without
 * this, EVERY openclaw tenant's "company" dataset would be a distinct, non-overlapping
 * dataset instead of the shared one the multi-scope plugin config advertises.
 *
 * Boot-time, one-shot per silo (mirrors `CogneeLiteLlmKey`): there is exactly one Cognee per
 * silo and this rarely changes, unlike per-tenant identities which provision on every
 * Tenant-CR reconcile.
 *
 * Crash-safe by construction: the credential is durably written to the Secret BEFORE the
 * first external Cognee call (register), so a crash between minting the password and
 * registering it can never leave an unrecoverable mismatch — a retry re-reads the SAME
 * already-persisted password. `tenantId` is left empty until the Cognee Tenant is
 * created/resolved; its presence is the idempotency marker for the whole method.
 */
export class CogneeSiloTenant
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
   * Ensure this silo has a Cognee owner account + Cognee Tenant. No-ops when Cognee is not
   * configured, or when a prior run already resolved a `tenantId`.
   *
   * @param clusterTenantName - This silo's own ClusterTenant name, used as the Cognee Tenant's
   *        display name only (`GET /permissions/tenants/me` is what actually re-identifies it
   *        on retry, not the name).
   * @param namespace - The silo's own namespace.
   */
  async ensureSiloTenant(clusterTenantName: string, namespace: string): Promise<void>
  {
    if (!this.config.cogneeEndpoint)
    {
      return;
    }

    let state = await _ReadSiloOwnerState(this.coreApi, namespace);
    if (state === undefined)
    {
      // Phase 1 — mint + durably persist the credential BEFORE any external call, so a crash
      // before phase 2 completes is always safe to retry with the IDENTICAL password.
      state = { username: _OWNER_EMAIL, password: randomBytes(32).toString("base64url"), tenantId: "" };
      await this._writeState(namespace, state);
      this.log.info({ clusterTenantName, namespace }, "created cognee silo owner credentials");
    }
    else if (state.tenantId)
    {
      // Already resolved once — but verify it is STILL live in Cognee before trusting the cached
      // tenantId. Cognee's identity store is persisted now (PVC), but a Cognee provisioned before
      // persistence landed, a rebuilt instance, or a manual reset leaves an empty user table, and
      // gating on "the Secret has a tenantId" alone would then never re-provision (the wipe-blind
      // bug this replaces). If the owner still logs in and its tenant still resolves we are
      // converged; otherwise fall through to re-provision. Re-provisioning mints a NEW tenantId,
      // which the per-tenant join step detects (its cached id no longer matches) and re-joins.
      if (await this._siloTenantIsLive(state, clusterTenantName))
      {
        this.log.debug({ clusterTenantName, namespace }, "cognee silo tenant already resolved and live");
        return;
      }
      this.log.warn({ clusterTenantName, namespace }, "cognee silo owner/tenant not live (identity store reset?); re-provisioning");
    }

    // Phase 2 — register (tolerating "already registered"), then find-or-create the silo's
    // Cognee Tenant. Both sub-steps are themselves idempotent, so this whole phase is safe
    // to retry from scratch on any failure.
    await this._registerOwner(state.username, state.password, clusterTenantName);
    const token = await this._loginOwner(state.username, state.password, clusterTenantName);
    const tenantId = await this._findOrCreateTenant(token, clusterTenantName);

    await this._writeState(namespace, { ...state, tenantId });
    this.log.info({ clusterTenantName, namespace, tenantId }, "resolved cognee silo tenant");
  }

  /**
   * Best-effort liveness probe of an already-resolved silo owner + Cognee Tenant: can the owner
   * still log in, and does `tenants/me` still return the cached tenant id? Returns false (⇒
   * re-provision) on a failed login, a non-OK lookup, or a tenant that no longer resolves. A
   * transient/unexpected error also returns false rather than throwing, so a wipe is never
   * silently treated as converged — re-provisioning is itself idempotent, so a false negative on a
   * blip just re-runs harmless register/find-or-create work.
   */
  private async _siloTenantIsLive(state: CogneeSiloOwnerState, clusterTenantName: string): Promise<boolean>
  {
    try
    {
      const token = await this._loginOwner(state.username, state.password, clusterTenantName);
      const response = await fetch(`${this.config.cogneeEndpoint}/api/v1/permissions/tenants/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok)
      {
        return false;
      }
      const mine = await response.json() as Array<{ id?: string }>;
      return mine.some(function _match(t) { return t.id === state.tenantId; });
    }
    catch
    {
      return false;
    }
  }

  /** Register the owner account. A 400 (already registered) is treated as success. */
  private async _registerOwner(email: string, password: string, clusterTenantName: string): Promise<void>
  {
    const response = await fetch(`${this.config.cogneeEndpoint}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok || response.status === 400)
    {
      return;
    }

    const body = await response.text();
    throw new Error(`Cognee silo-owner registration failed for ${clusterTenantName} (${response.status}): ${body}`);
  }

  /** Log in as the owner and return a bearer JWT. */
  private async _loginOwner(email: string, password: string, clusterTenantName: string): Promise<string>
  {
    const response = await fetch(`${this.config.cogneeEndpoint}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    });

    if (!response.ok)
    {
      const body = await response.text();
      throw new Error(`Cognee silo-owner login failed for ${clusterTenantName} (${response.status}): ${body}`);
    }

    const payload = await response.json() as { access_token?: string };
    if (!payload.access_token)
    {
      throw new Error(`Cognee silo-owner login for ${clusterTenantName} returned no access_token`);
    }

    return payload.access_token;
  }

  /**
   * Return the owner's existing Cognee Tenant if one is already resolvable
   * (`GET /permissions/tenants/me`), otherwise create one. Checking first makes this
   * safe to retry after a crash between creating the Tenant and persisting its id.
   *
   * @param retriesLeft - Guards the single re-check after a 409 race (see below) against
   *        looping forever if Cognee's own state is genuinely inconsistent.
   */
  private async _findOrCreateTenant(token: string, clusterTenantName: string, retriesLeft = 1): Promise<string>
  {
    const mineResponse = await fetch(`${this.config.cogneeEndpoint}/api/v1/permissions/tenants/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!mineResponse.ok)
    {
      const body = await mineResponse.text();
      throw new Error(`Cognee tenants/me lookup failed for ${clusterTenantName} (${mineResponse.status}): ${body}`);
    }

    const mine = await mineResponse.json() as Array<{ id: string; name: string }>;
    if (mine.length > 0)
    {
      return mine[0]!.id;
    }

    const createResponse = await fetch(
      `${this.config.cogneeEndpoint}/api/v1/permissions/tenants?tenant_name=${encodeURIComponent(clusterTenantName)}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );

    if (createResponse.status === 409 && retriesLeft > 0)
    {
      // Lost a race against a concurrent create (or `tenants/me` was stale) — re-fetch rather
      // than fail; the tenant now exists either way.
      return this._findOrCreateTenant(token, clusterTenantName, retriesLeft - 1);
    }

    if (!createResponse.ok)
    {
      const body = await createResponse.text();
      throw new Error(`Cognee tenant creation failed for ${clusterTenantName} (${createResponse.status}): ${body}`);
    }

    const created = await createResponse.json() as { tenant_id?: string };
    if (!created.tenant_id)
    {
      throw new Error(`Cognee tenant creation for ${clusterTenantName} returned no tenant_id`);
    }

    return created.tenant_id;
  }

  private async _writeState(namespace: string, state: CogneeSiloOwnerState): Promise<void>
  {
    const secret: k8s.V1Secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: COGNEE_SILO_OWNER_SECRET_NAME,
        namespace,
        labels: {
          "app.kubernetes.io/part-of": "opencrane",
          "app.kubernetes.io/component": "cognee",
          "app.kubernetes.io/managed-by": "opencrane-clustertenant-manager",
        },
      },
      type: "Opaque",
      data: {
        username: Buffer.from(state.username).toString("base64"),
        password: Buffer.from(state.password).toString("base64"),
        tenantId: Buffer.from(state.tenantId).toString("base64"),
      },
    };

    await __K8sApplyResource(this.objectApi, secret, this.log);
  }
}
