import { Inject, Injectable } from "@angular/core";

import { OnboardingSelection, OnboardingStep } from "./onboarding.types";

import { SESSION_STORAGE_GATEWAY, StorageGateway } from "@opencrane/state/utils/storage";

/**
 * Headless state service for persisting the self-serve onboarding flow.
 * 
 * Injected into the UI feature component to preserve progress across
 * the Zitadel OIDC redirect, abstracting away the browser storage mechanism.
 */
@Injectable({ providedIn: "root" })
export class OnboardingCacheService
{
	/** Storage key for the self-serve funnel progress. */
	private readonly _STATE_KEY = "weownai.onboarding.state";

	/** Initialize with the abstract session storage gateway. */
	constructor(@Inject(SESSION_STORAGE_GATEWAY) private readonly _storage: StorageGateway)
	{
	}

	/** Save the step and selection so it survives redirects. */
	public saveState(state: { step: OnboardingStep; selection: OnboardingSelection }): void
	{
		this._storage.setItem(this._STATE_KEY, JSON.stringify(state));
	}

	/** Read and deserialize the saved state. */
	public restoreState(): { step: OnboardingStep; selection: OnboardingSelection } | null
	{
		const raw = this._storage.getItem(this._STATE_KEY);
		if (raw === null)
		{
			return null;
		}

		try
		{
			const parsed = JSON.parse(raw) as { step: OnboardingStep; selection: OnboardingSelection };
			if (typeof parsed === "object" && parsed !== null && "step" in parsed && "selection" in parsed)
			{
				return parsed;
			}
			return null;
		}
		catch
		{
			// Ignore malformed JSON payload
			return null;
		}
	}

	/** Clear the saved state after a successful checkout. */
	public clearState(): void
	{
		this._storage.removeItem(this._STATE_KEY);
	}
}
