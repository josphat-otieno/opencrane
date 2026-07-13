/**
 * Headless DI contract for synchronous key-value storage.
 * 
 * Provides a platform seam so features and state caches can persist data
 * without tightly coupling to the native browser `window.localStorage` or
 * `window.sessionStorage` APIs, enabling safe SSR and desktop app support.
 */
export interface StorageGateway
{
	/** Return the value associated with `key`, or null if absent. */
	getItem(key: string): string | null;

	/** Set `value` for `key`, replacing any existing value. */
	setItem(key: string, value: string): void;

	/** Remove the specified `key` and its value. */
	removeItem(key: string): void;
}
