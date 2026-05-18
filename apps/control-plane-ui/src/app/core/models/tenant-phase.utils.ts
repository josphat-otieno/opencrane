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
    case TenantPhase.Unknown:
      return "secondary";
    default:
      return "secondary";
  }
}

/**
 * Parse an API-provided phase value into a known enum variant.
 * @param phase - Raw lifecycle phase string from API payload.
 */
export function _ParseTenantPhase(phase: string): TenantPhase
{
  switch (phase)
  {
    case TenantPhase.Running:
      return TenantPhase.Running;
    case TenantPhase.Pending:
      return TenantPhase.Pending;
    case TenantPhase.Suspended:
      return TenantPhase.Suspended;
    case TenantPhase.Error:
      return TenantPhase.Error;
    default:
      return TenantPhase.Unknown;
  }
}
