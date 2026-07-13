import { isDevMode } from "@angular/core";

/**
 * Mint a fresh, opaque random id.
 *
 * Prefers the platform CSPRNG (`crypto.randomUUID`), which is guaranteed in a
 * secure browser context (HTTPS or `localhost`). The `Date.now()`/`Math.random()`
 * fallback is NOT cryptographically strong and can collide, so it is only allowed
 * in local dev — in production a missing `crypto.randomUUID` means the app is
 * running in an insecure context, which we treat as a hard error rather than
 * silently minting weak ids.
 */
export function _RandomId(): string
{
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
		return crypto.randomUUID();

	if (!isDevMode())
		throw new Error("_RandomId: crypto.randomUUID is unavailable — secure context required in production");

	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
