import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";

/** Signal-driven prompt composer for the conversation feature. */
@Component({
	selector: "wo-conversation-composer",
	standalone: true,
	templateUrl: "./conversation-composer.component.html",
	styleUrl: "./conversation-composer.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationComposerComponent
{
	/** Whether a submit request is unresolved. */
	public readonly pending = input<boolean>(false);

	/** User-visible reason the composer is unavailable. */
	public readonly disabledReason = input<string | null>(null);

	/** Prompt intent emitted after local validation. */
	public readonly submitted = output<string>();

	/** Current composer text. */
	public readonly draft = signal<string>("");

	/** Whether the current draft can be submitted. */
	public readonly canSubmit = computed(this._canSubmit.bind(this));

	/** Update the signal-backed draft from the textarea. */
	public updateDraft(event: Event): void
	{
		const target = event.target;
		if (target instanceof HTMLTextAreaElement) this.draft.set(target.value);
	}

	/** Submit on Enter while preserving Shift+Enter for new lines. */
	public handleKeydown(event: KeyboardEvent): void
	{
		if (event.key !== "Enter" || event.shiftKey) return;
		event.preventDefault();
		this.submit();
	}

	/** Emit the trimmed prompt when the local composer state allows it. */
	public submit(): void
	{
		if (!this.canSubmit()) return;
		const prompt = this.draft().trim();
		this.submitted.emit(prompt);
	}

	/** Read the current signals and decide whether submit should be enabled. */
	private _canSubmit(): boolean
	{
		return this.disabledReason() === null && !this.pending() && this.draft().trim().length > 0;
	}
}
