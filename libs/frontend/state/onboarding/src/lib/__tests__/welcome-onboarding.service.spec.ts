import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it } from "vitest";

import { LOCAL_STORAGE_GATEWAY, StorageGateway } from "@opencrane/state/utils/storage";

import { WelcomeOnboardingService } from "../welcome-onboarding.service";
import { _WELCOME_COMPLETED_KEY, _WelcomeCompletedValue } from "../welcome-onboarding.util";

/** Minimal in-memory stub of StorageGateway for testing without a real browser API. */
class MockStorageGateway implements StorageGateway
{
	private readonly _store = new Map<string, string>();

	public getItem(key: string): string | null
	{
		return this._store.get(key) ?? null;
	}

	public setItem(key: string, value: string): void
	{
		this._store.set(key, value);
	}

	public removeItem(key: string): void
	{
		this._store.delete(key);
	}

	/** Test helper to seed storage directly. */
	public __seed(key: string, value: string): void
	{
		this._store.set(key, value);
	}
}

describe("WelcomeOnboardingService", () =>
{
	/** Helper to spin up the service in an isolated injection context with a fresh mock gateway. */
	function _setup(seedStorage?: boolean): { service: WelcomeOnboardingService; mockGateway: MockStorageGateway }
	{
		const mockGateway = new MockStorageGateway();
		if (seedStorage)
		{
			mockGateway.__seed(_WELCOME_COMPLETED_KEY, _WelcomeCompletedValue());
		}

		const injector = Injector.create({
			providers: [
				{ provide: LOCAL_STORAGE_GATEWAY, useValue: mockGateway },
				{ provide: WelcomeOnboardingService, useClass: WelcomeOnboardingService }
			]
		});

		const service = runInInjectionContext(injector, () => injector.get(WelcomeOnboardingService));
		return { service, mockGateway };
	}

	it("initializes completed signal to false when storage is empty", () =>
	{
		const { service } = _setup();

		expect(service.completed()).toBe(false);
	});

	it("initializes completed signal to true when storage contains the completed flag", () =>
	{
		const { service } = _setup(true); // seeds storage

		expect(service.completed()).toBe(true);
	});

	it("updates completed signal to true and writes to gateway on markComplete", () =>
	{
		const { service, mockGateway } = _setup();
		
		expect(service.completed()).toBe(false);
		expect(mockGateway.getItem(_WELCOME_COMPLETED_KEY)).toBeNull();

		service.markComplete();

		expect(service.completed()).toBe(true);
		expect(mockGateway.getItem(_WELCOME_COMPLETED_KEY)).toBe(_WelcomeCompletedValue());
	});

	it("updates completed signal to false and clears gateway on reset", () =>
	{
		const { service, mockGateway } = _setup(true);
		
		expect(service.completed()).toBe(true);
		expect(mockGateway.getItem(_WELCOME_COMPLETED_KEY)).toBe(_WelcomeCompletedValue());

		service.reset();

		expect(service.completed()).toBe(false);
		expect(mockGateway.getItem(_WELCOME_COMPLETED_KEY)).toBeNull();
	});
});
