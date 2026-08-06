import { ChangeDetectionStrategy, Component, input } from "@angular/core";

import { ConversationMessageRoles, ConversationMessageStates, ConversationMessageView } from "../conversation.types.js";

/** Renders one display-safe conversation message without owning commands or transport. */
@Component({
	selector: "wo-conversation-message",
	standalone: true,
	templateUrl: "./message-item.component.html",
	styleUrl: "./message-item.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageItemComponent
{
	/** Message prepared by the feature adapter. */
	public readonly message = input.required<ConversationMessageView>();

	/** Roles exposed to the template without repeated string literals. */
	public readonly roles = ConversationMessageRoles;

	/** Delivery states exposed to the template without repeated string literals. */
	public readonly states = ConversationMessageStates;
}
