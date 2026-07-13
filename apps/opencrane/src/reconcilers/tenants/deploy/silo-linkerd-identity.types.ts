/**
 * Type shapes for the per-silo Linkerd identity-layer policy objects emitted by
 * {@link _BuildSiloLinkerdIdentityPolicy} (S5 — the Linkerd identity substrate).
 *
 * These mirror the `policy.linkerd.io` CRDs at the field level. The operator applies
 * them as untyped custom objects via the Kubernetes `CustomObjectsApi` (the same path
 * the DNSEndpoint/cert-manager clients use), so they are modelled as plain typed
 * records rather than generated `@kubernetes/client-node` models — there are none for
 * Linkerd's CRDs. Keeping the shapes typed (not `Record<string, unknown>`) gives the
 * builder and its unit test a checked contract for the exact apiVersions/kinds.
 */

/** A `metadata` block carried by every emitted Linkerd policy object. */
export interface LinkerdObjectMeta
{
  /** Object name (deterministic, derived from the ClusterTenant name). */
  name: string;
  /** The silo namespace the object is created in. */
  namespace: string;
  /** Provenance + ownership labels mirroring the S2 baseline NetworkPolicy. */
  labels: Record<string, string>;
}

/**
 * Linkerd `Server` (`policy.linkerd.io/v1beta1`) — selects a set of meshed pods/ports
 * and, with `accessPolicy: deny`, flips them to default-deny so only an
 * {@link LinkerdAuthorizationPolicy} can admit traffic. The baseline selects EVERY pod
 * in the silo namespace (empty `podSelector`), the identity-layer analogue of the S2
 * NetworkPolicy's empty `podSelector` default-deny.
 */
export interface LinkerdServer
{
  /** Pinned policy CRD apiVersion. */
  apiVersion: "policy.linkerd.io/v1beta1";
  /** CRD kind. */
  kind: "Server";
  /** Object metadata. */
  metadata: LinkerdObjectMeta;
  /** Server spec. */
  spec: {
    /** Empty selector → every pod in the silo namespace (default-deny baseline). */
    podSelector: Record<string, never>;
    /** Port this Server governs; the meshed proxy admits all inbound ports by name. */
    port: string | number;
    /** Default disposition for traffic not matched by an AuthorizationPolicy. */
    accessPolicy: "deny";
  };
}

/**
 * Linkerd `MeshTLSAuthentication` (`policy.linkerd.io/v1alpha1`) — names the mesh mTLS
 * identities allowed to reach a {@link LinkerdServer}. The baseline names the silo's
 * own ServiceAccount identity domain and the operator/opencrane-ui namespace's, so the
 * only meshed callers admitted are intra-silo + the super-admin plane (mirroring the S2
 * ingress allow-list); no other silo's identity is ever listed (no cross-silo path).
 */
export interface LinkerdMeshTlsAuthentication
{
  /** Pinned policy CRD apiVersion. */
  apiVersion: "policy.linkerd.io/v1alpha1";
  /** CRD kind. */
  kind: "MeshTLSAuthentication";
  /** Object metadata. */
  metadata: LinkerdObjectMeta;
  /** Authentication spec. */
  spec: {
    /**
     * Allowed mesh-identity strings. Each is a SPIFFE-style identity of the form
     * `*.<namespace>.serviceaccount.identity.linkerd.cluster.local` — the wildcard
     * matches every ServiceAccount in that namespace.
     */
    identities: string[];
  };
}

/**
 * Linkerd `AuthorizationPolicy` (`policy.linkerd.io/v1alpha1`) — binds a target
 * ({@link LinkerdServer}) to the authentication(s) that may reach it. With the baseline
 * Server denying by default, this is the single rule that re-opens intra-silo +
 * operator-namespace traffic at the identity layer.
 */
export interface LinkerdAuthorizationPolicy
{
  /** Pinned policy CRD apiVersion. */
  apiVersion: "policy.linkerd.io/v1alpha1";
  /** CRD kind. */
  kind: "AuthorizationPolicy";
  /** Object metadata. */
  metadata: LinkerdObjectMeta;
  /** Authorization spec. */
  spec: {
    /** The protected target — the baseline {@link LinkerdServer} in this namespace. */
    targetRef: {
      /** Target API group (`policy.linkerd.io`). */
      group: "policy.linkerd.io";
      /** Target kind. */
      kind: "Server";
      /** Target Server name. */
      name: string;
    };
    /** Authentications that must match for traffic to be admitted. */
    requiredAuthenticationRefs: Array<{
      /** Authentication API group. */
      group: "policy.linkerd.io";
      /** Authentication kind. */
      kind: "MeshTLSAuthentication";
      /** Authentication object name. */
      name: string;
    }>;
  };
}

/**
 * The full per-silo Linkerd identity policy bundle: a default-deny {@link LinkerdServer},
 * the {@link LinkerdMeshTlsAuthentication} allow-list, and the
 * {@link LinkerdAuthorizationPolicy} binding them. Emitted together so the silo's
 * identity edge is closed and re-opened atomically (mirrors the single S2 NetworkPolicy).
 */
export interface SiloLinkerdIdentityPolicy
{
  /** Default-deny Server over every pod in the silo namespace. */
  server: LinkerdServer;
  /** Allowed mesh-identity allow-list (intra-silo + operator namespace). */
  meshTlsAuthentication: LinkerdMeshTlsAuthentication;
  /** Binds the Server to the authentication allow-list. */
  authorizationPolicy: LinkerdAuthorizationPolicy;
}
