/**
 * Linkerd mesh-injection constants shared across the platform.
 *
 * The namespace-injection annotation opts a namespace's pods into the Linkerd
 * mesh (sidecar + workload identity). It lives here in `@opencrane/infra-api`
 * because BOTH the fleet-manager (which builds the per-ClusterTenant namespace)
 * and the silo controllers (which build the per-silo Linkerd identity policy)
 * stamp the same annotation — sharing the constant keeps the two managers from
 * fighting over server-side-apply field ownership on the namespace.
 */

/** The namespace-injection annotation that opts a namespace's pods into the Linkerd mesh. */
export const LINKERD_INJECT_ANNOTATION = "linkerd.io/inject";

/** The annotation value enabling automatic sidecar/identity injection. */
export const LINKERD_INJECT_ENABLED = "enabled";
