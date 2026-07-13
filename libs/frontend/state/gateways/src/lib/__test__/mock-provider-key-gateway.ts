import { Injectable } from "@angular/core";

import { ModelProvider, ProviderKeyGateway, ProviderKeyStatus, SUPPORTED_MODEL_PROVIDERS } from "@opencrane/state/provider-key/adapter";

/** In-memory ProviderKeyGateway for tests — never imported by production code. */
@Injectable()
export class MockProviderKeyGateway implements ProviderKeyGateway
{
	/** Configured-key state keyed by provider; absent ⇒ unconfigured. */
	private readonly _keys = new Map<ModelProvider, ProviderKeyStatus>();

	/** @inheritdoc */
	public list(): Promise<ProviderKeyStatus[]>
	{
		const statuses = SUPPORTED_MODEL_PROVIDERS.map((provider: ModelProvider): ProviderKeyStatus =>
		{
			return this._keys.get(provider) ?? { provider, configured: false, litellmRegistered: false, updatedAt: null };
		});
		return Promise.resolve(statuses);
	}

	/** @inheritdoc */
	public setKey(provider: ModelProvider, _apiKey: string): Promise<ProviderKeyStatus>
	{
		const status: ProviderKeyStatus = { provider, configured: true, litellmRegistered: true, updatedAt: new Date().toISOString() };
		this._keys.set(provider, status);
		return Promise.resolve({ ...status });
	}

	/** @inheritdoc */
	public deleteKey(provider: ModelProvider): Promise<void>
	{
		this._keys.delete(provider);
		return Promise.resolve();
	}
}
