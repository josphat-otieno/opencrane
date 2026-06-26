import { _log } from "../log.js";

/**
 * The deployment role of this control-plane process (S6 / ADR 0002).
 *
 * The same control-plane image runs in two distinct topological positions, selected by the
 * `OPENCRANE_CONTROL_PLANE_ROLE` env (set by Helm from `deploymentRole`, see
 * `opencrane.deploymentRole`):
 *
 *  - `central` — the single, shared super-admin control-plane. Cross-silo, fleet-level: it
 *    manages the lifecycle of ClusterTenants (create/delete), their membership, the platform's
 *    Zitadel SA key, and platform DNS. It does NOT serve any tenant-facing per-silo surface,
 *    because it does not belong to any one silo. Central + Zitadel are the only shared
 *    components (ADR 0002, decision 1).
 *  - `silo` — a per-ClusterTenant control-plane, one instance dedicated to a single silo. It
 *    serves only that silo's tenant-facing surface (tenants, policies, skills, model-routing,
 *    sharing, …) against its own per-CT database. A single-cluster install is a silo-of-one and
 *    also runs as `silo` (it needs the runtime planes, which Helm renders only for `isSilo`).
 *
 * Splitting the surface by role is what retires the resolution-ambiguity machinery: a silo
 * control-plane serves exactly one ClusterTenant, so there is no caller→silo inference to make,
 * and a central control-plane never sees a tenant-facing request at all.
 */
export type ControlPlaneRole = "central" | "silo";

/** The set of accepted `OPENCRANE_CONTROL_PLANE_ROLE` values, for the fail-loud check. */
const _VALID_ROLES: readonly ControlPlaneRole[] = ["central", "silo"];

/**
 * Resolve this process's control-plane role from `OPENCRANE_CONTROL_PLANE_ROLE`.
 *
 * Defaults to `central` when unset — matching the Helm chart default (`deploymentRole: central`),
 * so an explicit silo install must opt in. Fail-loud on any other value: an unrecognised role is
 * a misconfiguration that would silently mis-mount the API surface, which is far worse to debug
 * than a boot-time crash.
 *
 * Read live (not snapshotted) so tests can set the env per-case; the value is stable in a running
 * deployment, so there is no divergence cost.
 *
 * @returns The validated control-plane role.
 * @throws If the env is set to anything other than `central` or `silo`.
 */
export function _ControlPlaneRole(): ControlPlaneRole
{
  const raw = process.env.OPENCRANE_CONTROL_PLANE_ROLE?.trim().toLowerCase() ?? "";
  if (raw === "")
  {
    return "central";
  }
  if (!_VALID_ROLES.includes(raw as ControlPlaneRole))
  {
    _log.error({ role: raw }, "Invalid OPENCRANE_CONTROL_PLANE_ROLE — must be 'central' or 'silo'.");
    throw new Error(
      `Invalid OPENCRANE_CONTROL_PLANE_ROLE ${JSON.stringify(raw)} — must be "central" or "silo".`,
    );
  }
  return raw as ControlPlaneRole;
}

/**
 * True when this control-plane serves the tenant-facing, per-silo API surface.
 *
 * That is every role except `central`: a `silo` (incl. single-cluster) serves its one silo's
 * tenants/policies/skills/sharing/etc; a `central` super-admin control-plane never does.
 */
export function _ServesTenantSurface(): boolean
{
  return _ControlPlaneRole() !== "central";
}

/**
 * True when this control-plane serves the fleet / super-admin API surface (cross-silo,
 * ClusterTenant lifecycle, Zitadel, platform DNS).
 *
 * That is every role except `silo`: only the `central` super-admin control-plane manages the
 * fleet. (These routes are further gated by their own feature flags — the manager/billing
 * switches — so `central` with the manager off serves none of them.)
 */
export function _ServesFleetSurface(): boolean
{
  return _ControlPlaneRole() !== "silo";
}
