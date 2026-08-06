import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

import { ConversationContextItemView, ConversationFileView, ConversationPanelKinds } from "../conversation.types.js";

/** Read-only context, file, and sharing companion panel. */
@Component({
	selector: "wo-conversation-support-panel",
	standalone: true,
	templateUrl: "./conversation-support-panel.component.html",
	styleUrl: "./conversation-support-panel.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationSupportPanelComponent
{
	/** Supporting panel currently selected by the user. */
	public readonly kind = input.required<ConversationPanelKinds>();

	/** Display-safe context evidence supplied by an adapter. */
	public readonly contextItems = input<readonly ConversationContextItemView[]>([]);

	/** Display-safe file metadata supplied by an adapter. */
	public readonly files = input<readonly ConversationFileView[]>([]);

	/** Requests closing the local visual panel. */
	public readonly closed = output<void>();

	/** Panel kinds exposed to the template without string literals. */
	public readonly kinds = ConversationPanelKinds;
}
