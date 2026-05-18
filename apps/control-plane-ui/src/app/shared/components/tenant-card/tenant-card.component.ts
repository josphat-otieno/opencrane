import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { CardModule } from "primeng/card";

import type { TenantSummary } from "../../core/models/tenant.models";

/** Severity mapping for PrimeNG Tag based on lifecycle phase. */
type TagSeverity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast" | undefined;

/**
 * Reusable card component displaying a tenant's name, team, phase badge, and action links.
 * Used on the Dashboard and Admin Panel feature pages.
 */
@Component({
  selector: "oc-tenant-card",
  standalone: true,
  imports: [CommonModule, RouterModule, TagModule, ButtonModule, CardModule],
  template: `
    <p-card [header]="tenant.displayName" styleClass="h-full">
      <div class="flex flex-column gap-2">
        <div class="flex align-items-center gap-2">
          <p-tag
            [value]="tenant.phase"
            [severity]="_phaseSeverity(tenant.phase)"
          />
          @if (tenant.team) {
            <span class="text-color-secondary text-sm">{{ tenant.team }}</span>
          }
        </div>
        <p class="text-color-secondary text-sm m-0">{{ tenant.email }}</p>
        @if (tenant.ingressHost) {
          <a [href]="'https://' + tenant.ingressHost" target="_blank" rel="noopener"
             class="text-sm text-primary">
            {{ tenant.ingressHost }}
          </a>
        }
      </div>
      <ng-template pTemplate="footer">
        <div class="flex gap-2">
          <a [routerLink]="['/tenants', tenant.name]">
            <p-button label="View" icon="pi pi-eye" size="small" [outlined]="true" />
          </a>
        </div>
      </ng-template>
    </p-card>
  `,
})
export class TenantCardComponent
{
  /** Tenant data to display. */
  @Input({ required: true }) tenant!: TenantSummary;

  /**
   * Map a lifecycle phase string to a PrimeNG Tag severity.
   * @param phase - Tenant lifecycle phase string.
   */
  _phaseSeverity(phase: string): TagSeverity
  {
    const map: Record<string, TagSeverity> = {
      Running: "success",
      Pending: "info",
      Suspended: "warn",
      Error: "danger",
    };

    return map[phase] ?? "secondary";
  }
}
