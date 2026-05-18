import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { TagModule } from "primeng/tag";
import { ProgressBarModule } from "primeng/progressbar";

import { TenantSpendAlertState, type TenantSpend } from "../../../core/models/tenant-spend.model";

/**
 * Compact spend chart component showing a tenant's budget usage as a progress bar.
 * Displays remaining budget, total ceiling, and alert state.
 */
@Component({
  selector: "oc-spend-chart",
  standalone: true,
  imports: [CommonModule, TagModule, ProgressBarModule],
  templateUrl: "./spend-chart.component.html",
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
    switch (state)
    {
      case TenantSpendAlertState.Ok:
        return "OK";
      case TenantSpendAlertState.Warning:
        return "Warning";
      case TenantSpendAlertState.Exceeded:
        return "Exceeded";
      default:
        return "OK";
    }
  }

  /**
   * Map alert state to a PrimeNG Tag severity.
   * @param state - Budget alert state.
   */
  _alertSeverity(state: TenantSpend["budgetAlertState"]): "success" | "warn" | "danger"
  {
    switch (state)
    {
      case TenantSpendAlertState.Ok:
        return "success";
      case TenantSpendAlertState.Warning:
        return "warn";
      case TenantSpendAlertState.Exceeded:
        return "danger";
      default:
        return "success";
    }
  }
}
