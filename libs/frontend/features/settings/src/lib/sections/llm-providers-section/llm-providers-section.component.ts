import { ChangeDetectionStrategy, Component, Signal, computed, signal, inject, resource } from "@angular/core";

import { DestructiveActionPhase, DestructiveActionState, LlmProviderFeedback, ModelRouteCategory } from "@opencrane/core";
import { DestructiveConfirmationComponent } from "@opencrane/elements/ui";
import { ModelProvider, PROVIDER_KEY_GATEWAY, ProviderKeyStatus, SUPPORTED_MODEL_PROVIDERS } from "@opencrane/state/provider-key/adapter";
import { _settledValue } from "../../resource.util.js";

/** Display metadata for one supported provider. */
interface ProviderDisplay
{
	/** Provider identifier used by the BYOK gateway. */
	readonly provider: ModelProvider;

	/** Human-readable provider name. */
	readonly name: string;

	/** Human-readable supported model summary. */
	readonly models: string;
}

/** Safe configured-provider row displayed by the Models section. */
interface ProviderRow extends ProviderDisplay
{
	/** Stable identifier used by existing row tracking and dialog labels. */
	readonly id: ModelProvider;

	/** Whether this provider currently has a stored key. */
	readonly configured: boolean;

	/** When the key was configured, or an inactive placeholder label. */
	readonly added: string;

	/** LiteLLM registration state or inactive placeholder label. */
	readonly lastUsed: string;
}

/** Provider display metadata keyed by the BYOK contract enum. */
const PROVIDER_DISPLAY: Record<ModelProvider, ProviderDisplay> =
{
	[ModelProvider.OpenAi]: { provider: ModelProvider.OpenAi, name: "OpenAI", models: "gpt-4o · gpt-4o-mini · gpt-4-turbo" },
	[ModelProvider.Anthropic]: { provider: ModelProvider.Anthropic, name: "Anthropic", models: "claude-opus · claude-sonnet · claude-haiku" },
	[ModelProvider.Gemini]: { provider: ModelProvider.Gemini, name: "Google Gemini", models: "gemini-flash · gemini-pro" },
	[ModelProvider.Mistral]: { provider: ModelProvider.Mistral, name: "Mistral", models: "mistral-large · mistral-small" },
	[ModelProvider.DeepSeek]: { provider: ModelProvider.DeepSeek, name: "DeepSeek", models: "deepseek-chat · deepseek-reasoner" },
	[ModelProvider.Glm]: { provider: ModelProvider.Glm, name: "Zhipu GLM", models: "glm-4 · glm-4-air" }
};

/** Read-only examples until model-routing settings are backed by a public contract. */
const MODEL_ROUTE_CATEGORIES_UNAVAILABLE: readonly ModelRouteCategory[] =
[
	{ id: "simple", name: "Simple / factual lookup", description: "Short questions, definitions, quick edits.", model: "Not configurable yet" },
	{ id: "reasoning", name: "Complex reasoning", description: "Multi-step analysis, planning, maths.", model: "Not configurable yet" },
	{ id: "code", name: "Code & technical", description: "Writing, reviewing, or debugging code.", model: "Not configurable yet" }
];

/** Workspace provider keys and category routing from the authoritative Paper handoff. */
@Component({
	selector: "wo-llm-providers-section",
	standalone: true,
	imports: [DestructiveConfirmationComponent],
	templateUrl: "./llm-providers-section.component.html",
	styleUrl: "./llm-providers-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class LlmProvidersSectionComponent
{
	/** Contract-backed provider-key gateway. */
	private readonly _gateway = inject(PROVIDER_KEY_GATEWAY);

	/** Safe configured-provider metadata; never contains credential text. */
	public readonly providersResource = resource({
		loader: (): Promise<ProviderKeyStatus[]> => this._gateway.list()
	});

	/** Full provider status list in supported-provider order. */
	public readonly providers: Signal<readonly ProviderRow[]> = computed((): readonly ProviderRow[] =>
	{
		const statuses = _settledValue(this.providersResource) ?? [];
		const byProvider = new Map(statuses.map(function index(status): [ModelProvider, ProviderKeyStatus]
		{
			return [status.provider, status];
		}));
		return SUPPORTED_MODEL_PROVIDERS.map(function mapProvider(provider): ProviderRow
		{
			const display = PROVIDER_DISPLAY[provider];
			const status = byProvider.get(provider);
			return {
				id: provider,
				name: display.name,
				models: display.models,
				provider,
				configured: status?.configured ?? false,
				added: _ProviderAddedLabel(status),
				lastUsed: _ProviderRegistrationLabel(status)
			};
		});
	});

	/** Complete Add Provider Key catalogue. */
	public readonly providerOptions: readonly ProviderDisplay[] = SUPPORTED_MODEL_PROVIDERS.map(function mapDisplay(provider): ProviderDisplay
	{
		return PROVIDER_DISPLAY[provider];
	});

	/** Answer-model options used by every category selector. */
	public readonly modelOptions: readonly string[] = ["Not configurable yet"];

	/** Mounted-only route-owned Add Provider Key sub-page state. */
	public readonly addPageOpen = signal(false);

	/** Provider currently being configured in the Add sub-page. */
	public readonly selectedProviderId = signal<ModelProvider | null>(null);

	/** Raw input exists only while this mounted component owns the add flow. */
	public readonly keyDraft = signal("");

	/** Whether Save key owns the global add-form lock. */
	public readonly savePending = signal(false);

	/** Accessible provider mutation feedback. */
	public readonly feedback = signal<LlmProviderFeedback | null>(null);

	/** Configured provider waiting for confirmed removal. */
	public readonly removeTarget = signal<ProviderRow | null>(null);

	/** Button that opened removal confirmation and regains focus when it closes. */
	public readonly removeFocusTarget = signal<HTMLElement | null>(null);

	/** Surviving list control used when a successful removal destroys its invoker. */
	public readonly removeSuccessFocusTarget = signal<HTMLElement | null>(null);

	/** Shared destructive-confirmation state. */
	public readonly destructiveState = signal<DestructiveActionState>({ phase: DestructiveActionPhase.Idle });

	/** Selected fast classifier model. */
	public readonly analysisModel = signal("Not configurable yet");

	/** Mounted-only route-category assignments. */
	public readonly routeCategories = signal<readonly ModelRouteCategory[]>(MODEL_ROUTE_CATEGORIES_UNAVAILABLE);

	/** Selected provider metadata, derived without storing a second mutable copy. */
	public readonly selectedProvider: Signal<ProviderDisplay | null> = computed((): ProviderDisplay | null =>
	{
		const providerId = this.selectedProviderId();
		return providerId === null ? null : PROVIDER_DISPLAY[providerId];
	});

	/** Open the authoritative sub-page with pristine transient state. */
	public openAddPage(): void
	{
		this._clearTransientKey();
		this.feedback.set(null);
		this.addPageOpen.set(true);
	}

	/** Return to the list and destroy all mounted credential input. */
	public closeAddPage(): void
	{
		if (this.savePending()) return;
		this._clearTransientKey();
		this.selectedProviderId.set(null);
		this.feedback.set(null);
		this.addPageOpen.set(false);
	}

	/** Select a provider and discard any key entered for the previous choice. */
	public selectProvider(providerId: ModelProvider): void
	{
		if (this.savePending()) return;
		this._clearTransientKey();
		this.feedback.set(null);
		this.selectedProviderId.set(providerId);
	}

	/** Capture password-control input only in mounted component state. */
	public updateKeyDraft(event: Event): void
	{
		this.keyDraft.set((event.target as HTMLInputElement).value);
		this.feedback.set(null);
	}

	/** Save one transient key through the fixture boundary, then destroy the input. */
	public async saveKey(): Promise<void>
	{
		const provider = this.selectedProvider();
		const key = this.keyDraft();
		if (provider === null || key.trim() === "" || this.savePending()) return;

		this.savePending.set(true);
		this.feedback.set(null);
		try
		{
			await this._gateway.setKey(provider.provider, key);
			this.providersResource.reload();
			this._clearTransientKey();
			this.selectedProviderId.set(null);
			this.addPageOpen.set(false);
			this.feedback.set({ kind: "success", message: "Provider key saved successfully." });
		}
		catch
		{
			this.feedback.set({ kind: "error", message: "The provider key could not be saved. Try again." });
		}
		finally
		{
			this.savePending.set(false);
		}
	}

	/** Request explicit removal confirmation for one configured provider. */
	public requestRemove(provider: ProviderRow, event: Event, successFocusTarget: HTMLElement): void
	{
		this.feedback.set(null);
		this.destructiveState.set({ phase: DestructiveActionPhase.Idle });
		this.removeFocusTarget.set(event.currentTarget as HTMLElement | null);
		this.removeSuccessFocusTarget.set(successFocusTarget);
		this.removeTarget.set(provider);
	}

	/** Close a non-pending provider removal dialog. */
	public cancelRemove(): void
	{
		if (this.destructiveState().phase !== DestructiveActionPhase.Pending) this.removeTarget.set(null);
	}

	/** Remove the confirmed provider or expose a recoverable error in the dialog. */
	public async confirmRemove(): Promise<void>
	{
		const target = this.removeTarget();
		if (target === null || this.destructiveState().phase === DestructiveActionPhase.Pending) return;
		this.destructiveState.set({ phase: DestructiveActionPhase.Pending });
		try
		{
			await this._gateway.deleteKey(target.provider);
			this.removeFocusTarget.set(this.removeSuccessFocusTarget());
			this.providersResource.reload();
			this.destructiveState.set({ phase: DestructiveActionPhase.Success });
			this.removeTarget.set(null);
			this.feedback.set({ kind: "success", message: "Provider key removed successfully." });
		}
		catch
		{
			this.destructiveState.set({ phase: DestructiveActionPhase.Error, message: "The provider key could not be removed. Try again." });
		}
	}

	/** Select the prompt-analysis model. */
	public updateAnalysisModel(event: Event): void
	{
		this.analysisModel.set((event.target as HTMLSelectElement).value);
	}

	/** Update one category-to-model assignment. */
	public updateCategoryModel(categoryId: string, event: Event): void
	{
		const model = (event.target as HTMLSelectElement).value;
		this.routeCategories.update(function update(rows): readonly ModelRouteCategory[]
		{
			return rows.map(function change(row): ModelRouteCategory { return row.id === categoryId ? { ...row, model } : row; });
		});
	}

	/** Append one deterministic editable mock category. */
	public addCategory(): void
	{
		this.feedback.set({ kind: "error", message: "Model routing settings are not available yet." });
	}

	/** Remove one category assignment from mounted-only routing state. */
	public removeCategory(categoryId: string): void
	{
		void categoryId;
		this.feedback.set({ kind: "error", message: "Model routing settings are not available yet." });
	}

	/** Destroy the only state that may hold raw credential text. */
	private _clearTransientKey(): void
	{
		this.keyDraft.set("");
	}
}

/** Format the configured date without exposing key material. */
function _ProviderAddedLabel(status: ProviderKeyStatus | undefined): string
{
	if (!status?.updatedAt) return "Not connected";
	return new Date(status.updatedAt).toLocaleDateString();
}

/** Format the LiteLLM registration state for one provider status. */
function _ProviderRegistrationLabel(status: ProviderKeyStatus | undefined): string
{
	if (!status?.configured) return "Inactive";
	return status.litellmRegistered ? "Registered with LiteLLM" : "Secret-only";
}
