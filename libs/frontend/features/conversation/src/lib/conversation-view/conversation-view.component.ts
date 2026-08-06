import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";

import { SessionStore } from "@opencrane/state/core";

import { ConversationMessageView, ConversationPanelKinds } from "../conversation.types.js";
import { MessageItemComponent } from "../message-item/message-item.component.js";
import { ConversationSupportPanelComponent } from "../support-panel/conversation-support-panel.component.js";

/** Initial conversation surface shown before messaging commands are connected. */
@Component({
	selector: "wo-conversation-view",
	standalone: true,
	imports: [MessageItemComponent, ConversationSupportPanelComponent],
	templateUrl: "./conversation-view.component.html",
	styleUrl: "./conversation-view.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationViewComponent
{
	private readonly _session = inject(SessionStore);

	/** Canonical, display-safe messages supplied by a future replay adapter. */
	public readonly messages = input<readonly ConversationMessageView[]>([]);

	/** Opaque server-issued route identifier; absent for a new conversation. */
	public readonly threadId = input<string>();

	/** Read-only companion panel selected within the conversation view. */
	public readonly activePanel = signal<ConversationPanelKinds>(ConversationPanelKinds.None);

	/** Panel kinds exposed to the template without string literals. */
	public readonly panelKinds = ConversationPanelKinds;

	/** Header title that does not expose opaque identifiers as user-facing labels. */
	public readonly title = computed((): string => this.threadId() ? "Conversation" : "New conversation");

	/** Friendly signed-in greeting. */
	public readonly displayName = computed((): string => this._session.displayName() ?? "there");

	/** Toggle one local read-only supporting panel. */
	public togglePanel(kind: ConversationPanelKinds): void
	{
		this.activePanel.update(function _toggle(current: ConversationPanelKinds): ConversationPanelKinds
		{
			return current === kind ? ConversationPanelKinds.None : kind;
		});
	}
}
