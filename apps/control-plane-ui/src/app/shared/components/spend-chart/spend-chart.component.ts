import { Component, Input } from "@angular/core";
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
  imports: [TagModule, ProgressBarModule],
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
    const budget = this._budgetValue();
    if (budget <= 0)
    {
      return 0;
    }

    return Math.min(100, Math.round((this._spentValue() / budget) * 100));
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

  /**
   * Resolve the primary displayed spent value, preferring EUR when present.
   */
  _spentValue(): number
  {
    return this.spend.spentEur ?? this.spend.spentUsd;
  }

  /**
   * Resolve the primary displayed budget value, preferring EUR when present.
   */
  _budgetValue(): number
  {
    return this.spend.budgetEur ?? this.spend.budgetUsd;
  }

  /**
   * Resolve the preferred display currency symbol for the chart.
   */
  _currencySymbol(): string
  {
    return this.spend.budgetEur !== undefined ? "€" : "$";
  }
}
