import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";

import { _GetTenantPhaseSeverity, type TenantPhaseTagSeverity } from "../../../core/models/tenant-phase.utils";
import type { TenantSummary } from "../../../core/models/tenant-summary.model";

/**
 * Reusable card component displaying a tenant's name, team, phase badge, and action links.
 * Used on the Dashboard and Admin Panel feature pages.
 */
@Component({
  selector: "oc-tenant-card",
  standalone: true,
  imports: [CommonModule, RouterModule, TagModule, ButtonModule, CardModule],
  templateUrl: "./tenant-card.component.html",
})
export class TenantCardComponent
{
  /** Tenant data to display. */
  @Input({ required: true }) tenant!: TenantSummary;

  /**
   * Map a lifecycle phase string to a PrimeNG Tag severity.
   * @param phase - Tenant lifecycle phase string.
   */
  _phaseSeverity(phase: string): TenantPhaseTagSeverity
  {
    return _GetTenantPhaseSeverity(phase);
  }
}
