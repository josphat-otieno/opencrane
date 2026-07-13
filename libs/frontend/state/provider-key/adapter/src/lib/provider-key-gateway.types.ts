import { InjectionToken } from "@angular/core";

/**
 * A model provider that supports bring-your-own-key (BYOK) configuration.
 *
 * Mirrors the fixed enum in the pinned opencrane-ui contract
 * (`ByokProviderKeyStatus.provider`). The list is closed: every supported
 * provider is rendered even when no key is configured, so the screen seeds an
 * unconfigured row from this enum rather than from the server response.
 */
export enum ModelProvider
{
	/** OpenAI (GPT family). */
	OpenAi = "openai",
	/** Anthropic (Claude family). */
	Anthropic = "anthropic",
	/** Google Gemini. */
	Gemini = "gemini",
	/** Mistral. */
	Mistral = "mistral",
	/** DeepSeek. */
	DeepSeek = "deepseek",
	/** Zhipu GLM. */
	Glm = "glm"
}

/** Every supported provider, in display order; drives the full-list render. */
export const SUPPORTED_MODEL_PROVIDERS: readonly ModelProvider[] =
[
	ModelProvider.OpenAi,
	ModelProvider.Anthropic,
	ModelProvider.Gemini,
	ModelProvider.Mistral,
	ModelProvider.DeepSeek,
	ModelProvider.Glm
];

/**
 * Read model for one provider's BYOK key status, as surfaced to the UI.
 *
 * Never carries key material — a stored key is write-only and is never returned
 * by any read. `litellmRegistered` distinguishes a key LiteLLM accepted on its
 * dynamic path from one that only landed in the k8s Secret ("Secret-only").
 */
export interface ProviderKeyStatus
{
	/** The provider this status describes. */
	provider: ModelProvider;

	/** Whether a key is currently set for this provider in this silo. */
	configured: boolean;

	/** Whether LiteLLM accepted the key on its dynamic path (false ⇒ Secret-only). */
	litellmRegistered: boolean;

	/** When the key was last set; null when not configured. */
	updatedAt: string | null;
}

/**
 * Abstraction over the OpenCrane BYOK provider-key API
 * (`/providers/byok`).
 *
 * Components depend only on this interface, so the transport can be swapped
 * (live OpenCrane client → in-memory fake) without touching the screen.
 * Implementations live in this `adapter` lib; the binding is provided in the
 * app's `app.config.ts`.
 *
 * **Security contract.** {@link setKey} is the only path a secret enters, and it
 * is write-only: a stored key is never returned by {@link list} or any other
 * read.
 */
export interface ProviderKeyGateway
{
	/**
	 * List the BYOK key status for every supported provider. Providers without a
	 * configured key are still returned (`configured: false`).
	 */
	list(): Promise<ProviderKeyStatus[]>;

	/**
	 * Set or refresh a provider's raw key (writes a k8s Secret + LiteLLM
	 * credential). Write-only: the value is sent to the control plane and never
	 * returned. Resolves with the updated status.
	 *
	 * @param provider - The provider whose key to set.
	 * @param apiKey   - The raw upstream provider API key.
	 */
	setKey(provider: ModelProvider, apiKey: string): Promise<ProviderKeyStatus>;

	/**
	 * Remove a provider's key (deletes the Secret, LiteLLM credential, and
	 * record).
	 *
	 * @param provider - The provider whose key to remove.
	 */
	deleteKey(provider: ModelProvider): Promise<void>;
}

/** DI token for the active {@link ProviderKeyGateway} implementation. */
export const PROVIDER_KEY_GATEWAY: InjectionToken<ProviderKeyGateway> = new InjectionToken<ProviderKeyGateway>("WO_PROVIDER_KEY_GATEWAY");
