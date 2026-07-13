import { ChangeDetectionStrategy, Component, Signal, computed, inject, resource, signal } from "@angular/core";

import { MODELS, MODEL_CLASSES, ModelClass, ModelInfo, SpendSlice, _ToggleId } from "@opencrane/core";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { BudgetSpend, SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { SaveButtonComponent, SectionHeadingComponent, SettingsRowComponent } from "@opencrane/elements/ui";
import { ToggleFieldComponent } from "../../components/toggle-field/toggle-field.component";
import { ModelChipComponent } from "../../components/model-chip/model-chip.component";
import { _settledValue } from "../../resource.util";

/** Model & Budget settings section: spend, routing strategy, model classes. */
@Component({
	selector: "wo-model-budget-section",
	standalone: true,
	imports: [SectionHeadingComponent, SettingsRowComponent, SaveButtonComponent, ToggleFieldComponent, ModelChipComponent],
	templateUrl: "./model-budget-section.component.html",
	styleUrl: "./model-budget-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelBudgetSectionComponent
{
	/** Active settings data source (mock by default; live OpenCrane when bound). */
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Active pod/tenant name, resolved at the state level (live, or demo pod in mock/offline dev). */
	private readonly _tenant: Signal<string | undefined> = inject(ActiveTenantStore).tenant;

	/** Live monthly spend for the active pod, re-fetched when the tenant changes. */
	private readonly _spend = resource({
		params: (): string | undefined => this._tenant(),
		loader: ({ params }): Promise<BudgetSpend> => this._gateway.getBudgetSpend(params)
	});

	/** "$current / $limit" label for the monthly spend card. */
	public readonly spendLabel: Signal<string> = computed((): string =>
	{
		const spend = _settledValue(this._spend);
		if (!spend)
		{
			return "—";
		}
		return `$${spend.currentSpendUsd.toFixed(2)} / $${spend.monthlyLimitUsd.toFixed(2)}`;
	});

	/** Percentage of the monthly limit used (0–100), for the spend bar width. */
	public readonly spendPercent: Signal<number> = computed((): number =>
	{
		const spend = _settledValue(this._spend);
		if (!spend || spend.monthlyLimitUsd <= 0)
		{
			return 0;
		}
		return Math.min(100, Math.round((spend.currentSpendUsd / spend.monthlyLimitUsd) * 100));
	});

	/** Budget alert band (`ok` | `warning` | `exceeded`). */
	public readonly alertState: Signal<string> = computed((): string =>
	{
		return _settledValue(this._spend)?.alertState ?? "ok";
	});

	/** Editable copy of the model classes. */
	public readonly classes = signal<ModelClass[]>(MODEL_CLASSES);

	/** Ids of expanded class rows. */
	public readonly expanded = signal<string[]>([]);

	/** All routable models. */
	public readonly models: ModelInfo[] = MODELS;

	/** Spend breakdown slices — populated from the live gateway once available. */
	public readonly slices: SpendSlice[] = [];

	/** Routing strategy options. */
	public readonly strategies: string[] = ["Cost-optimised", "Quality-first", "Latency-first", "Manual override"];

	/** Whether a class row is expanded. */
	public isExpanded(id: string): boolean
	{
		return this.expanded().includes(id);
	}

	/** Toggles a class row expansion. */
	public toggleExpanded(id: string): void
	{
		this.expanded.update(function toggle(current: string[]): string[] { return _ToggleId(current, id); });
	}

	/** Updates the primary model of a class. */
	public setPrimary(id: string, modelId: string): void
	{
		this.classes.update(function apply(current: ModelClass[]): ModelClass[]
		{
			return current.map(function patch(cls: ModelClass): ModelClass
			{
				return cls.id === id ? { ...cls, primary: modelId } : cls;
			});
		});
	}

	/** Adds a fallback model to a class. */
	public addFallback(id: string, modelId: string): void
	{
		if (!modelId)
		{
			return;
		}
		this.classes.update(function apply(current: ModelClass[]): ModelClass[]
		{
			return current.map(function patch(cls: ModelClass): ModelClass
			{
				return cls.id === id ? { ...cls, fallbacks: [...cls.fallbacks, modelId] } : cls;
			});
		});
	}

	/** Removes a fallback model from a class. */
	public removeFallback(id: string, modelId: string): void
	{
		this.classes.update(function apply(current: ModelClass[]): ModelClass[]
		{
			return current.map(function patch(cls: ModelClass): ModelClass
			{
				return cls.id === id
					? { ...cls, fallbacks: cls.fallbacks.filter(function keep(value: string): boolean { return value !== modelId; }) }
					: cls;
			});
		});
	}

	/** Models not yet used by a class (for the add-fallback select). */
	public availableModels(cls: ModelClass): ModelInfo[]
	{
		return this.models.filter(function unused(model: ModelInfo): boolean
		{
			return model.id !== cls.primary && !cls.fallbacks.includes(model.id);
		});
	}
}
