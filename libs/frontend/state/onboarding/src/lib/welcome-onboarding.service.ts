import { Injectable, Signal, inject, signal } from "@angular/core";

import { LOCAL_STORAGE_GATEWAY } from "@opencrane/state/utils/storage";

import { _HasCompletedWelcome, _WELCOME_COMPLETED_KEY, _WelcomeCompletedValue } from "./welcome-onboarding.util";

/**
 * First-run onboarding gate (domain-level state).
 *
 * A thin wrapper over a single persistent flag recording whether the user
 * has completed the operator app's welcome flow. Lives in `state/onboarding`
 * — the onboarding domain's state library — because it is read by both the
 * welcome feature (which writes it) and the operator app's first-run route
 * guard (which reads it); a route guard must not statically import a
 * lazy-loaded feature, so the shared state cannot live in `features/welcome`.
 *
 * The completion decision itself is the pure `_HasCompletedWelcome` util. This
 * service only does the persistence wiring, exposes the flag as a signal so the
 * view stays reactive (zoneless), and relies on the abstract storage gateway to
 * degrade gracefully when storage is unavailable (SSR, private mode, desktop)
 * by treating onboarding as incomplete and silently no-opping writes.
 */
@Injectable({ providedIn: "root" })
export class WelcomeOnboardingService
{
	/** Gateway abstracting the native browser storage. */
	private readonly _storage = inject(LOCAL_STORAGE_GATEWAY);

	/** Reactive completed-flag, seeded from persistence on construction. */
	private readonly _completed = signal<boolean>(this._read());

	/** Whether first-run onboarding has been completed for this browser. */
	public readonly completed: Signal<boolean> = this._completed.asReadonly();

	/** Mark first-run onboarding complete and persist it (best-effort). */
	public markComplete(): void
	{
		this._completed.set(true);
		this._write(_WelcomeCompletedValue());
	}

	/** Clear the completed flag (e.g. to replay the flow); best-effort. */
	public reset(): void
	{
		this._completed.set(false);
		this._remove();
	}

	/** Read the completed flag from the storage gateway, defaulting to false. */
	private _read(): boolean
	{
		return _HasCompletedWelcome(this._storage.getItem(_WELCOME_COMPLETED_KEY));
	}

	/** Persist a raw value under the completed key; no-op when unavailable. */
	private _write(value: string): void
	{
		this._storage.setItem(_WELCOME_COMPLETED_KEY, value);
	}

	/** Remove the completed key; no-op when storage is unavailable. */
	private _remove(): void
	{
		this._storage.removeItem(_WELCOME_COMPLETED_KEY);
	}
}
