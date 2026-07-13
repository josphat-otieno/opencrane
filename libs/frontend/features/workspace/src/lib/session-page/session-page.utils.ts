import { _RandomId } from "@opencrane/core";

/**
 * Mint a unique session key for a brand-new session.
 *
 * Session keys are client-chosen, opaque strings — the gateway creates the
 * session lazily on the first `chat.send`, so the UI can pick the id up front
 * and deep-link to it without a server round-trip. A UUID guarantees
 * uniqueness; the `s-` prefix keeps the id legible in the URL and in logs.
 */
export function _NewSessionId(): string
{
	return `s-${_RandomId()}`;
}
