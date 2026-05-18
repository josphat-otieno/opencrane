import { TenantPhase } from "./tenant-phase.enum";

/** Tag severities used by PrimeNG for tenant phase labels. */
export type TenantPhaseTagSeverity = "success" | "info" | "warn" | "danger" | "secondary";

/**
 * Resolve the PrimeNG tag severity for a tenant phase value.
 * @param phase - Current tenant lifecycle phase.
 */
export function _GetTenantPhaseSeverity(phase: string): TenantPhaseTagSeverity
{
  switch (phase)
  {
    case TenantPhase.Running:
      return "success";
    case TenantPhase.Pending:
      return "info";
    case TenantPhase.Suspended:
      return "warn";
    case TenantPhase.Error:
      return "danger";
    default:
      return "secondary";
  }
}
