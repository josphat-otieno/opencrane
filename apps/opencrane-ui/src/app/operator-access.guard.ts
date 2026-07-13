import { Injector, computed, inject } from "@angular/core";
import { toObservable } from "@angular/core/rxjs-interop";
import { CanActivateFn, Router, UrlTree } from "@angular/router";
import { filter, firstValueFrom } from "rxjs";

import { SessionStore } from "@opencrane/state/core";

/**
 * Gate for every authenticated operator route.
 *
 * Resolves async so the navigation waits for `/auth/me` (and, when the session
 * is authenticated, `GET /tenants`) to settle before deciding — otherwise a
 * cold guard would see `hasValue() === false` and either flash the wrong
 * destination or loop the redirects. The decision matrix once both resources
 * settle:
 *
 * - anonymous session → redirect to `/login`
 * - authenticated session with no UserTenant resolvable in this org →
 *   redirect to `/no-tenant` (the operator app is one-org-per-host, so an
 *   empty `currentTenant` is the "no tenant for the user in this org" state)
 * - authenticated session with a tenant → allow activation
 *
 * Wide-scope (`___`) prefix because feature/app libs consume it directly.
 */
export const ___OperatorAccessGuard: CanActivateFn = async function ___OperatorAccessGuard(): Promise<boolean | UrlTree>
{
	const session = inject(SessionStore);
	const router = inject(Router);
	const injector = inject(Injector);

	// Wait for `/auth/me` to settle (no longer loading). Reading `isLoading`
	// inside a `computed` makes the wait reactive — the guard resumes the
	// moment the resource transitions out of its loading state, whether it
	// resolved with a value or threw.
	const meSettled = computed(function _meSettled(): boolean
	{
		return !session.me.isLoading();
	});
	await firstValueFrom(toObservable(meSettled, { injector }).pipe(filter(Boolean)));

	if (!session.authenticated())
	{
		return router.parseUrl("/login");
	}

	// Authenticated — wait for the tenants list before deciding whether the
	// user has a workspace in this org. The resource gates its own fetch on
	// authentication, so this only ever runs against a real session.
	const tenantsSettled = computed(function _tenantsSettled(): boolean
	{
		return !session.tenants.isLoading();
	});
	await firstValueFrom(toObservable(tenantsSettled, { injector }).pipe(filter(Boolean)));

	if (!session.currentTenant())
	{
		return router.parseUrl("/no-tenant");
	}

	return true;
};
