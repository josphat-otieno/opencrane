import { Injector, runInInjectionContext } from "@angular/core";
import { describe, expect, it } from "vitest";

import { SessionStore } from "@opencrane/state/core";

import { AccountSectionComponent } from "./account-section.component.js";

/** Minimal SessionStore shape used by the Account section tests. */
interface _SessionFixture
{
	/** Whether the fake session is authenticated. */
	readonly authenticated: () => boolean;

	/** Display name signal replacement. */
	readonly displayName: () => string | undefined;

	/** User signal replacement. */
	readonly user: () => { readonly sub: string; readonly email?: string; readonly clusterTenant?: string | null } | undefined;

	/** Capability signal replacement. */
	readonly capabilities: () => { readonly isPlatformOperator: boolean; readonly customerAdmin: boolean };

	/** Fake logout action. */
	readonly logout: () => Promise<void>;
}

/** Create an Account section with a fake SessionStore. */
function _component(session: _SessionFixture): AccountSectionComponent
{
	const injector = Injector.create({
		providers: [{ provide: SessionStore, useValue: session }]
	});
	return runInInjectionContext(injector, function create(): AccountSectionComponent
	{
		return new AccountSectionComponent();
	});
}

describe("AccountSectionComponent", function accountSectionSuite(): void
{
	it("reads identity and role from SessionStore", function readsSession(): void
	{
		const component = _component({
			authenticated: function authenticated(): boolean { return true; },
			displayName: function displayName(): string { return "Ada Lovelace"; },
			user: function user() { return { sub: "idp|ada", email: "ada@example.com", clusterTenant: "elewa-default" }; },
			capabilities: function capabilities() { return { isPlatformOperator: false, customerAdmin: true }; },
			logout: async function logout(): Promise<void> {}
		});

		expect(component.displayName()).toBe("Ada Lovelace");
		expect(component.email()).toBe("ada@example.com");
		expect(component.subject()).toBe("idp|ada");
		expect(component.workspace()).toBe("elewa-default");
		expect(component.role()).toBe("Organisation admin");
		expect(component.avatarInitials()).toBe("AL");
	});

	it("exposes retryable logout failure state", async function logoutFailure(): Promise<void>
	{
		const component = _component({
			authenticated: function authenticated(): boolean { return true; },
			displayName: function displayName(): string { return "Ada Lovelace"; },
			user: function user() { return { sub: "idp|ada" }; },
			capabilities: function capabilities() { return { isPlatformOperator: false, customerAdmin: false }; },
			logout: async function logout(): Promise<void> { throw new Error("offline"); }
		});

		await component.logout();

		expect(component.logoutPending()).toBe(false);
		expect(component.logoutError()).toBe(true);
	});
});
