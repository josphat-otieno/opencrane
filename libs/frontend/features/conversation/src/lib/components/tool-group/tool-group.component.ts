import { ChangeDetectionStrategy, Component, computed, input, signal } from "@angular/core";

import { MessageCard } from "@opencrane/core";

import { ToolEntryComponent } from "../tool-entry/tool-entry.component";

/**
 * A run of consecutive tool calls. A single call renders as one compact row; a burst
 * collapses (by default) into one unobtrusive "Called N tools ›" line that expands to
 * list every call in order — each an individually-expandable {@link ToolEntryComponent}
 * row (input preview → full input + output detail). The message stream coalesces adjacent
 * tool-only messages into one group so a whole agentic step reads as a single disclosure.
 */
@Component({
	selector: "wo-tool-group",
	standalone: true,
	imports: [ToolEntryComponent],
	templateUrl: "./tool-group.component.html",
	styleUrl: "./tool-group.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToolGroupComponent
{
	/** The consecutive tool cards to render as one group. */
	public readonly tools = input.required<MessageCard[]>();

	/** Timestamp shown to the right on hover (stream-level groups only; "" hides it). */
	public readonly time = input<string>("");

	/** Whether the burst is expanded (collapsed by default — the "less obtrusive" state). */
	public readonly open = signal<boolean>(false);

	/** A lone tool call renders as a single row (no "Called N tools" wrapper). */
	public readonly single = computed<boolean>(() => this.tools().length === 1);

	/** Collapsed summary for a burst of calls. */
	public readonly summary = computed<string>(() => `Called ${this.tools().length} tools`);

	/** Whether any call in the group errored (drives the collapsed error hint). */
	public readonly anyError = computed<boolean>(() => this.tools().some((tool) => tool.isError === true));

	/** Toggle the burst's expanded state. */
	public toggle(): void
	{
		this.open.update((open: boolean): boolean => !open);
	}
}
