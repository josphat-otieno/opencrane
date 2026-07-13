import { InjectionToken } from "@angular/core";

/**
 * Which of the two strictly-separated WeOwnAI surfaces an app build serves.
 *
 * Platform operator and org/customer admin live on **different domains with
 * different logins** (one shared OIDC provider) — they are not gradations of a
 * single console. Capability derivation is therefore scoped to a surface and
 * honours only that surface's own role dimension (see {@link _DeriveCapabilities}).
 *
 * - `"platform"` — the fleet/platform-operator app (`apps/fleet`): fleet-wide
 *   customer / tenant / billing management, keyed off `isPlatformOperator`.
 * - `"org"` — the customer/org app (`apps/opencrane-ui`): the end-user workspace
 *   plus account-scoped org-admin screens, keyed off `isOrgAdmin`.
 */
export type PlatformSurface = "platform" | "org";

/**
 * DI token naming the surface the current app build serves. Each app provides it
 * exactly once (`fleet` → `"platform"`, `opencrane-ui` → `"org"`);
 * {@link SessionStore} reads it so a role claim only ever unlocks controls on its
 * own surface — a cross-domain token grants nothing.
 */
export const PLATFORM_SURFACE = new InjectionToken<PlatformSurface>("WO_PLATFORM_SURFACE");
