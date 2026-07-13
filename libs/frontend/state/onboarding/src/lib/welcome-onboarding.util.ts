/** `localStorage` key the welcome completed-flag is read from and written to. */
export const _WELCOME_COMPLETED_KEY = "wo.welcome.completed";

/** The value written to mark first-run onboarding as completed. */
export function _WelcomeCompletedValue(): string
{
	return "1";
}

/**
 * Whether the raw `localStorage` value means onboarding has been completed.
 *
 * Pure and total so it is unit-tested directly: treats the canonical completed
 * value as done, and anything else — `null` (never set), an empty string, or a
 * stale/unknown value — as not yet completed.
 *
 * @param raw - The raw string read from `localStorage`, or null when absent.
 */
export function _HasCompletedWelcome(raw: string | null): boolean
{
	return raw === _WelcomeCompletedValue();
}
