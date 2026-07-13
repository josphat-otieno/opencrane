import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";

import { MessageCard, MessageCardKind, MessageDelivery, ThreadMessage } from "@opencrane/core";
import { A2uiCanvasComponent } from "@opencrane/elements/a2ui";
import { LedgerCardComponent } from "@opencrane/elements/ui";

import { CopyCodeDirective } from "../../directives/copy-code.directive";
import { MarkdownPipe } from "../../pipes/markdown.pipe";
import { ToolGroupComponent } from "../tool-group/tool-group.component";

/**
 * A block in the assistant card stack: either a single non-tool card, or a run of
 * consecutive tool calls coalesced so they render as one grouped disclosure.
 */
interface RenderBlock
{
	/** "tools" for a coalesced run of tool cards; "card" for anything else. */
	kind: "tools" | "card";
	/** The tool cards, when kind is "tools". */
	tools?: MessageCard[];
	/** The single card, when kind is "card". */
	card?: MessageCard;
}

/** Renders one thread message: user bubble or assistant card stack. */
@Component({
	selector: "wo-message-item",
	standalone: true,
	imports: [LedgerCardComponent, ToolGroupComponent, MarkdownPipe, CopyCodeDirective, A2uiCanvasComponent],
	templateUrl: "./message-item.component.html",
	styleUrl: "./message-item.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageItemComponent
{
	/** Message to render. */
	public readonly message = input.required<ThreadMessage>();

	/** Emits an in-process A2UI canvas user action for return to the agent (see gateway). */
	public readonly canvasAction = output<unknown>();

	/** Card kind enum for template comparisons. */
	public readonly cardKind = MessageCardKind;

	/** Decision recorded per decide-card id ("approve" | "reject"). */
	public readonly decisions = signal<Record<string, string>>({});

	/** Image-loaded state per image URL. */
	public readonly loadedImages = signal<Record<string, boolean>>({});

	/** Whether the reasoning ("thinking") block is expanded (collapsed by default). */
	public readonly thinkingOpen = signal<boolean>(false);

	/** Whether the message is from the assistant (memoised). */
	public readonly isAssistant = computed<boolean>(() => this.message().role === "assistant");

	/**
	 * The card stack folded into render blocks: consecutive Tool cards coalesce into one
	 * "tools" block so a burst of tool activity renders as a single grouped disclosure
	 * rather than a stack of separate chips. All other cards pass through unchanged.
	 */
	public readonly blocks = computed<RenderBlock[]>(() =>
	{
		const blocks: RenderBlock[] = [];
		for (const card of this.message().cards)
		{
			if (card.type === MessageCardKind.Tool)
			{
				const last = blocks[blocks.length - 1];
				if (last && last.kind === "tools" && last.tools)
				{
					last.tools.push(card);
				}
				else
				{
					blocks.push({ kind: "tools", tools: [card] });
				}
			}
			else
			{
				blocks.push({ kind: "card", card });
			}
		}
		return blocks;
	});

	/** Delivery-outcome enum for template comparisons. */
	public readonly delivery = MessageDelivery;

	/** The turn's delivery outcome, or undefined for a clean/streaming reply. */
	public readonly deliveryState = computed<MessageDelivery | undefined>(() => this.message().delivery);

	/** Concatenated text content for the user bubble (memoised). */
	public readonly userText = computed<string>(() =>
	{
		return this.message().cards
			.filter(function isText(card: MessageCard): boolean { return card.type === MessageCardKind.Text; })
			.map(function pickContent(card: MessageCard): string { return card.content ?? ""; })
			.join("");
	});

	/** Toggles the reasoning ("thinking") disclosure. */
	public toggleThinking(): void
	{
		this.thinkingOpen.update((open: boolean): boolean => !open);
	}

	/** Records a decision for a decide card. */
	public decide(card: MessageCard, decision: string): void
	{
		this.decisions.update(function record(current: Record<string, string>): Record<string, string>
		{
			return { ...current, [card.id ?? ""]: decision };
		});
	}

	/** Marks an image card as loaded. */
	public markLoaded(card: MessageCard): void
	{
		this.loadedImages.update(function record(current: Record<string, boolean>): Record<string, boolean>
		{
			return { ...current, [card.imageUrl ?? ""]: true };
		});
	}
}
