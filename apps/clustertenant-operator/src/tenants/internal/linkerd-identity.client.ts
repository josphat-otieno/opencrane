import type * as k8s from "@kubernetes/client-node";
import type { Logger } from "pino";

import { _IsConflict, _IsCrdAbsent, __ReplaceCustomObjectWithLiveVersion } from "@opencrane/infra-api";
import type { SiloLinkerdIdentityPolicy } from "../deploy/silo-linkerd-identity.types.js";

/** Linkerd policy API group for the Server/AuthorizationPolicy/MeshTLSAuthentication CRDs. */
const _LINKERD_POLICY_GROUP = "policy.linkerd.io";
/** Stable apiVersion for the `Server` CRD. */
const _SERVER_VERSION = "v1beta1";
/** Plural for the namespaced `Server` custom resource. */
const _SERVER_PLURAL = "servers";
/** apiVersion shared by `AuthorizationPolicy` + `MeshTLSAuthentication`. */
const _ALPHA_VERSION = "v1alpha1";
/** Plural for the namespaced `MeshTLSAuthentication` custom resource. */
const _MESHTLS_PLURAL = "meshtlsauthentications";
/** Plural for the namespaced `AuthorizationPolicy` custom resource. */
const _AUTHZ_PLURAL = "authorizationpolicies";

/**
 * One member of the per-silo Linkerd identity bundle, paired with the discovery
 * coordinates needed to apply it as an untyped custom object.
 */
interface LinkerdObjectToApply
{
  /** CRD apiVersion segment (e.g. `v1beta1`). */
  version: string;
  /** CRD plural (e.g. `servers`). */
  plural: string;
  /** The custom-object manifest to apply. */
  manifest: Record<string, unknown>;
}

/**
 * Applies the per-silo Linkerd identity policy bundle (S5 — Server +
 * MeshTLSAuthentication + AuthorizationPolicy) over the operator's custom-objects API.
 *
 * The operator has no generated `@kubernetes/client-node` model for the `policy.linkerd.io`
 * CRDs, so the bundle is applied as untyped custom objects — the same path the
 * `DnsEndpointClient`/`CertManagerClient` use for their CRs. It carries the identical
 * create-then-replace-on-409 + fail-closed-on-absent-CRD posture: when Linkerd is NOT
 * installed (the policy CRDs are not served) apply does NOT crash the silo reconcile — it
 * logs a structured skip and returns `applied: false`, so enabling the gate on a cluster
 * that lacks Linkerd is a safe no-op rather than a wedged reconcile.
 */
export class LinkerdIdentityClient
{
  /** Kubernetes custom-objects client (Linkerd policy CRDs). */
  private readonly customApi: k8s.CustomObjectsApi;

  /** Scoped logger for apply/skip lifecycle messages. */
  private readonly log: Logger;

  /**
   * @param customApi - Kubernetes custom-objects client.
   * @param log - Logger used for apply/skip lifecycle messages.
   */
  public constructor(customApi: k8s.CustomObjectsApi, log: Logger)
  {
    this.customApi = customApi;
    this.log = log;
  }

  /**
   * Apply the full identity bundle into the silo namespace, idempotently.
   *
   * @param namespace - The silo namespace the objects are created in.
   * @param bundle - The Server + MeshTLSAuthentication + AuthorizationPolicy bundle.
   * @returns Whether the bundle was applied (`false` when Linkerd's CRDs are absent).
   */
  public async applySiloIdentityPolicy(
    namespace: string,
    bundle: SiloLinkerdIdentityPolicy,
  ): Promise<{ applied: boolean }>
  {
    // 1. Order Server first so the deny-by-default posture exists before the
    //    authentication + binding that re-open it; MeshTLSAuthentication before the
    //    AuthorizationPolicy that references it.
    const objects: LinkerdObjectToApply[] = [
      { version: _SERVER_VERSION, plural: _SERVER_PLURAL, manifest: bundle.server as unknown as Record<string, unknown> },
      { version: _ALPHA_VERSION, plural: _MESHTLS_PLURAL, manifest: bundle.meshTlsAuthentication as unknown as Record<string, unknown> },
      { version: _ALPHA_VERSION, plural: _AUTHZ_PLURAL, manifest: bundle.authorizationPolicy as unknown as Record<string, unknown> },
    ];

    // 2. Apply each member; an absent Linkerd CRD short-circuits the WHOLE bundle to a
    //    fail-closed not-applied result (no partial bundle is left behind).
    for (const obj of objects)
    {
      const result = await this._applyOne(namespace, obj);
      if (!result.applied)
      {
        return result;
      }
    }

    return { applied: true };
  }

  /**
   * Apply a single Linkerd custom object with create-then-replace-on-409 semantics and a
   * fail-closed-on-absent-CRD short-circuit.
   *
   * @param namespace - The silo namespace the object is created in.
   * @param obj - The object coordinates + manifest to apply.
   * @returns Whether this object was applied (`false` only when its CRD is absent).
   */
  private async _applyOne(namespace: string, obj: LinkerdObjectToApply): Promise<{ applied: boolean }>
  {
    const { version, plural, manifest } = obj;
    const name = ((manifest.metadata as Record<string, unknown>)?.name) as string;

    try
    {
      // 1. Create first — the common path on a fresh silo.
      await this.customApi.createNamespacedCustomObject({
        group: _LINKERD_POLICY_GROUP, version, namespace, plural, body: manifest,
      });
      return { applied: true };
    }
    catch (err)
    {
      // 2. No Linkerd → the policy CRD is not served. Fail closed, never crash: log a
      //    structured skip so an operator who flipped the gate on a Linkerd-less cluster
      //    sees exactly why nothing was applied.
      if (_IsCrdAbsent(err, _LINKERD_POLICY_GROUP, plural))
      {
        this.log.warn(
          { namespace, plural, name },
          "Linkerd mesh enabled but policy CRD is absent (Linkerd not installed); skipping silo identity policy",
        );
        return { applied: false };
      }

      // 3. 409 Conflict → already exists; fetch the live resourceVersion and replace
      //    in-place so a re-apply converges (idempotent).
      if (_IsConflict(err))
      {
        await __ReplaceCustomObjectWithLiveVersion(this.customApi, { group: _LINKERD_POLICY_GROUP, version, namespace, plural, name, manifest });
        return { applied: true };
      }

      // 4. Any other failure (incl. an unrelated 404, e.g. a missing namespace — which
      //    `_IsCrdAbsent` deliberately does NOT classify as a CRD absence) is a real error.
      //    Re-throw so the reconcile surfaces it rather than masking it.
      throw err;
    }
  }
}
