import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

import { ConversationCitationView, ConversationContextItemView, ConversationFileView, ConversationMemoryReferenceView, ConversationPanelKinds } from "../conversation.types.js";

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

	/** Display-safe citations supplied by replay projection. */
	public readonly citations = input<readonly ConversationCitationView[]>([]);

	/** Display-safe file metadata supplied by an adapter. */
	public readonly files = input<readonly ConversationFileView[]>([]);

	/** Display-safe memory references supplied by replay projection. */
	public readonly memoryReferences = input<readonly ConversationMemoryReferenceView[]>([]);

	/** Requests closing the local visual panel. */
	public readonly closed = output<void>();

	/** Panel kinds exposed to the template without string literals. */
	public readonly kinds = ConversationPanelKinds;

	/** User-facing file action state. */
	public fileState(file: ConversationFileView): string
	{
		if (file.accessState === "readable") return "Available";
		if (file.accessState === "unavailable") return "Unavailable";
		return "Metadata only";
	}
}
