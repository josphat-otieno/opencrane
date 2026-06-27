import type { Request } from "express";

/**
 * The request's effective host, honouring the `x-forwarded-host` set by the ingress proxy
 * (first value when comma-joined) and falling back to the `Host` header. Undefined when the
 * request carries no host. Shared by every per-org-host path so they read the host one way.
 *
 * @param req - The incoming Express request.
 * @returns The host (no scheme), or undefined when none is present.
 */
export function _RequestHost(req: Request): string | undefined
{
  const forwardedHost = req.headers?.["x-forwarded-host"];
  if (typeof forwardedHost === "string") return forwardedHost.split(",")[0].trim();
  return typeof req.get === "function" ? req.get("host") : undefined;
}

/**
 * Derive the ClusterTenant (silo) the caller is currently on from the request host. Each org is
 * served at `<clusterTenant>.<base>`, so the first DNS label names the silo (port and case are
 * stripped). Returns undefined for a bare host with no subdomain (e.g. localhost) so the caller
 * falls back to an unscoped lookup. The label is only a candidate: the email→tenant query filters
 * on it and yields zero rows for a host whose first label is not a real silo, so a wrong guess
 * fail-closes rather than mis-resolving. Custom org domains that do not follow `<org>.<base>` are
 * not matched here (a future ingressHost-based lookup would cover them).
 *
 * @param host - The request host, typically from {@link _RequestHost}.
 * @returns The silo (first DNS label), or undefined when none can be derived.
 */
export function _ClusterTenantFromHost(host: string | undefined): string | undefined
{
  if (!host) return undefined;
  const firstLabel = host.split(":")[0].trim().toLowerCase().split(".")[0];
  return firstLabel || undefined;
}
