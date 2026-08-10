/**
 * Read an Angular `resource()` value only after it settles successfully.
 *
 * A resource throws when `value()` is read in a loading or errored state. Settings sections use this helper so transient API failures become empty/loading UI instead of change-detection errors.
 *
 * @param resource - The resource-like object to read.
 */
export function _settledValue<T>(resource: { hasValue(): boolean; value(): T }): T | undefined
{
	return resource.hasValue() ? resource.value() : undefined;
}
