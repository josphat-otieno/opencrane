import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import { Router } from "@angular/router";

import { ConversationViewComponent, FilePanelComponent, FilePreviewService } from "@opencrane/features/conversation";
import { ContextPanelComponent } from "@opencrane/features/context";
import { NewSessionRelay } from "./new-session-relay";
import { _NewSessionId } from "./session-page.utils";

/** Session route page: the conversation stream plus its context / file side panel. */
@Component({
	selector: "wo-session-page",
	standalone: true,
	imports: [ConversationViewComponent, ContextPanelComponent, FilePanelComponent],
	templateUrl: "./session-page.component.html",
	styleUrl: "./session-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionPageComponent
{
	private readonly _router = inject(Router);
	private readonly _relay = inject(NewSessionRelay);

	/** The file a tool row has portaled to the side panel (null when none is open). */
	public readonly filePreview = inject(FilePreviewService);

	/** Routed `session/:id` param, bound via `withComponentInputBinding()`. Absent on the root "new session" route. */
	public readonly id = input<string>();

	/**
	 * Open thread id. Empty on the root route, which renders a blank "new session"
	 * composer — no thread is opened and no history loads until the first message
	 * mints a session (see {@link startSession}).
	 */
	public readonly threadId = computed<string>(() => this.id() ?? "");

	/**
	 * First message of a just-created session, handed across the navigation that
	 * created this page (consume-once; `undefined` for a normal deep-link). The
	 * conversation view sends it once the new thread opens.
	 */
	public readonly initialMessage: string | undefined = this._relay.consume();

	/** Whether the context panel is open. */
	public readonly contextOpen = signal<boolean>(true);

	/**
	 * Start a session from the root composer's first message: mint a session id,
	 * stash the message for the next page, and deep-link to `session/:id`.
	 */
	public startSession(firstMessage: string): void
	{
		this._relay.stash(firstMessage);
		void this._router.navigate(["/session", _NewSessionId()]);
	}
}
