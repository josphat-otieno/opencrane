import { Capabilities, SessionTenant } from "./session-store.types";
import { PlatformSurface } from "./platform-surface";

/**
 * Pure capability-derivation rule for the session store, factored out so the
 * authentication/role to {@link Capabilities} mapping can be unit-tested without
 * Angular DI or driving the `me` resource. The store calls this from its
 * `capabilities` computed; the API remains the enforcement point.
 *
 * Scoped to a single {@link PlatformSurface}: each surface honours **only its own
 * role dimension** — `isPlatformOperator` on the `"platform"` surface, `isOrgAdmin`
 * on the `"org"` surface. The two are strictly separated (different domains and
 * logins, one shared OIDC), so a claim belonging to the other surface grants
 * nothing here, and the `operator` union below can never combine powers across
 * surfaces because at most one tier is ever live for a given surface. Everything
 * is additionally gated on `authenticated`, so an unauthenticated session grants
 * nothing regardless of the role flags. The API remains the enforcement point.
 *
 * @param authenticated      - Whether a opencrane-ui session is established.
 * @param isPlatformOperator - Platform-operator claim (fleet-wide); honoured only on the `"platform"` surface.
 * @param isOrgAdmin         - Org-admin claim (account-scoped); honoured only on the `"org"` surface.
 * @param surface            - Which surface this app build serves (see {@link PlatformSurface}).
 */
export function _DeriveCapabilities(authenticated: boolean, isPlatformOperator: boolean, isOrgAdmin: boolean, surface: PlatformSurface): Capabilities
{
	// A surface honours only its own role; a cross-domain claim grants nothing.
	const platformOperator = surface === "platform" && authenticated && isPlatformOperator;
	const customerAdmin = surface === "org" && authenticated && isOrgAdmin;
	// At most one tier is live per surface, so this union never crosses domains.
	const operator = platformOperator || customerAdmin;
	return {
		isOperator: operator,
		isPlatformOperator: platformOperator,
		customerAdmin,
		manageTenants: operator,
		manageCustomers: platformOperator,
		managePolicies: operator,
		manageBudgets: operator
	};
}

/**
 * Pure resolution rule for the session's active tenant, factored out so the
 * selection-versus-fallback logic is unit-testable without Angular DI or driving
 * the `tenants` resource. The store calls this from its `currentTenant` computed.
 *
 * A user-chosen selection wins when it names a tenant the caller can see;
 * otherwise the caller's own tenant is resolved by email (the interim default,
 * pending a `/tenants/me` endpoint — see docs/architecture.md §3.1). An unknown
 * or stale selection falls back to the email match rather than resolving to
 * nothing. When the email matches no visible tenant either (e.g. an operator
 * session whose identity maps to no pod), the first visible tenant is used so a
 * single-pod session still resolves a pod — a dropped or unmatched tenant never
 * leaves the session pointing at an empty pod. Only an empty tenant list
 * resolves to `undefined`.
 *
 * @param selectedName - The tenant name the user switched to, or null when none.
 * @param tenants      - All tenants visible to the caller.
 * @param email        - The caller's own email, used for the default resolution.
 */
export function _ResolveCurrentTenant(selectedName: string | null, tenants: readonly SessionTenant[], email: string | undefined): SessionTenant | undefined
{
	if (selectedName)
	{
		const selected = tenants.find(function byName(t: SessionTenant): boolean
		{
			return t.name === selectedName;
		});
		if (selected)
		{
			return selected;
		}
	}
	const normalised = email?.toLowerCase();
	const byEmail = normalised
		? tenants.find(function byEmail(t: SessionTenant): boolean
		{
			return t.email.toLowerCase() === normalised;
		})
		: undefined;
	// Email match wins; otherwise default to the first visible pod (interim — an
	// operator whose email maps to no pod still gets an active tenant to act on).
	return byEmail ?? tenants[0];
}
