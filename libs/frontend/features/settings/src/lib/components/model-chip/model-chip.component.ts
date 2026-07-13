import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";

import { MODELS, ModelInfo, PROVIDER_COLORS } from "@opencrane/core";

/** Inline model chip with provider initial, label, pricing, optional remove. */
@Component({
	selector: "wo-model-chip",
	standalone: true,
	templateUrl: "./model-chip.component.html",
	styleUrl: "./model-chip.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelChipComponent
{
	/** Model id to render. */
	public readonly modelId = input.required<string>();

	/** Show a remove button. */
	public readonly removable = input<boolean>(false);

	/** Emits when the remove button is clicked. */
	public readonly removed = output<void>();

	/** Model info for the chip (memoised). */
	public readonly model = computed<ModelInfo | undefined>(() =>
	{
		const id = this.modelId();
		return MODELS.find(function byId(candidate: ModelInfo): boolean { return candidate.id === id; });
	});

	/** Provider colour for the chip (memoised). */
	public readonly providerColor = computed<string>(() => PROVIDER_COLORS[this.model()?.provider ?? ""] ?? "var(--muted-foreground)");

	/** Pricing caption ("$in/out" or "$local"), memoised. */
	public readonly pricing = computed<string>(() =>
	{
		const model = this.model();
		if (!model)
		{
			return "";
		}
		return model.inputPer1M === 0 ? "$local" : `$${model.inputPer1M}/${model.outputPer1M}`;
	});
}
