import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { TagModule } from "primeng/tag";
import { ProgressBarModule } from "primeng/progressbar";

import type { TenantSpend } from "../../core/models/tenant.models";

/**
 * Compact spend chart component showing a tenant's budget usage as a progress bar.
 * Displays remaining budget, total ceiling, and alert state.
 */
@Component({
  selector: "oc-spend-chart",
  standalone: true,
  imports: [CommonModule, TagModule, ProgressBarModule],
  template: `
    <div class="flex flex-column gap-2">
      <div class="flex justify-content-between align-items-center">
        <span class="text-sm font-medium">Budget usage</span>
        <p-tag
          [value]="_alertLabel(spend.budgetAlertState)"
          [severity]="_alertSeverity(spend.budgetAlertState)"
        />
      </div>
      <p-progressbar
        [value]="_usagePercent()"
        [showValue]="false"
        [style]="{ height: '8px' }"
      />
      <div class="flex justify-content-between text-sm text-color-secondary">
        <span>\${{ spend.spentUsd.toFixed(2) }} spent</span>
        <span>\${{ spend.budgetUsd.toFixed(2) }} budget</span>
      </div>
    </div>
  `,
})
export class SpendChartComponent
{
  /** Spend data to visualise. */
  @Input({ required: true }) spend!: TenantSpend;

  /**
   * Compute the percentage of budget consumed (0–100).
   */
  _usagePercent(): number
  {
    if (this.spend.budgetUsd <= 0)
    {
      return 0;
    }

    return Math.min(100, Math.round((this.spend.spentUsd / this.spend.budgetUsd) * 100));
  }

  /**
   * Map alert state to a human-readable label.
   * @param state - Budget alert state.
   */
  _alertLabel(state: TenantSpend["budgetAlertState"]): string
  {
    const map: Record<TenantSpend["budgetAlertState"], string> = {
      ok: "OK",
      warning: "Warning",
      exceeded: "Exceeded",
    };

    return map[state];
  }

  /**
   * Map alert state to a PrimeNG Tag severity.
   * @param state - Budget alert state.
   */
  _alertSeverity(state: TenantSpend["budgetAlertState"]): "success" | "warn" | "danger"
  {
    const map: Record<TenantSpend["budgetAlertState"], "success" | "warn" | "danger"> = {
      ok: "success",
      warning: "warn",
      exceeded: "danger",
    };

    return map[state];
  }
}
