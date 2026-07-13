/**
 * Read an Angular `resource()`'s value, or `undefined` while it is still loading
 * or in an error state.
 *
 * `ResourceRef.value()` **throws** when the resource has errored (e.g. the live
 * gateway returned 401 because the session expired, or 404 for an unresolved
 * tenant). A section that reads `.value()` directly inside a `computed` therefore
 * throws during change detection and breaks its view. Guarding with `hasValue()`
 * first degrades to "no data yet" instead — centralised here so every section
 * reads the same safe way. Structurally typed so it needs no `ResourceRef` import.
 *
 * @param resource - The resource to read (anything with `hasValue`/`value`).
 */
export function _settledValue<T>(resource: { hasValue(): boolean; value(): T }): T | undefined
{
	return resource.hasValue() ? resource.value() : undefined;
}
