/**
 * `@opencrane/infra-api` — shared Kubernetes API plumbing used by both the
 * fleet-manager and the clustertenant-manager: CRD identity constants, the
 * normalisation helpers for @kubernetes/client-node error shapes, the generic
 * apply/watch primitives both operators drive, the ClusterTenant CR shape both
 * read, and the per-ClusterTenant namespace builder both apply (shared so a
 * server-side-apply on the namespace never fights over field ownership).
 */
export * from "./crd-constants.js";
export * from "./k8s-errors.js";
export * from "./k8s-api-errors.js";
export * from "./k8s-apply.js";
export * from "./custom-object-apply.js";
export * from "./watch-runner.js";
export * from "./cluster-tenant.types.js";
export * from "./linkerd.js";
export * from "./cluster-tenant-namespace.js";
