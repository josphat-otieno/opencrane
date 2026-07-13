import { Injectable } from "@angular/core";

/**
 * In-memory hand-off for the first message of a freshly-created session.
 *
 * Starting a session from the root "new session" composer mints a session id and
 * navigates to `session/:id`, which destroys the draft page and creates a new
 * one — so the typed message must survive the navigation. Router `state` would
 * work but persists in `history.state` and would re-send on a page reload; this
 * relay lives only in memory, so a reload starts clean.
 *
 * Single-slot and consume-once: {@link stash} holds the pending message and
 * {@link consume} reads-and-clears it, so the message is sent exactly once. A
 * second {@link stash} before a {@link consume} overwrites the pending message
 * (last write wins) — fine for the single composer that drives this flow.
 */
@Injectable({ providedIn: "root" })
export class NewSessionRelay
{
	/** The pending first message, or `undefined` once consumed. */
	private _pending: string | undefined;

	/** Stash the first message for the session page that the navigation creates. */
	public stash(message: string): void
	{
		this._pending = message;
	}

	/** Read and clear the stashed first message (`undefined` if none is pending). */
	public consume(): string | undefined
	{
		const pending = this._pending;
		this._pending = undefined;
		return pending;
	}
}
