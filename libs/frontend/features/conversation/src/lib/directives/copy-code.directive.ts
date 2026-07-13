import { Directive, HostListener } from "@angular/core";

/**
 * Wires the copy button the markdown pipeline emits inside code blocks. The pipeline renders
 * `<button class="code-block-copy" data-code="…">`; attach this directive to the container that
 * holds the rendered `[innerHTML]` and a click on any copy button writes its `data-code` to the
 * clipboard and briefly flips the button into its "copied" state (styled via `.copied`).
 */
@Directive({ selector: "[woCopyCode]", standalone: true })
export class CopyCodeDirective
{
	/** Delegate clicks on a `.code-block-copy` button to the clipboard. */
	@HostListener("click", ["$event"])
	public onClick(event: MouseEvent): void
	{
		const target = event.target as HTMLElement | null;
		const button = target?.closest<HTMLElement>(".code-block-copy");
		if (!button)
		{
			return;
		}
		const code = button.getAttribute("data-code") ?? "";
		void navigator.clipboard?.writeText(code).then(() =>
		{
			button.classList.add("copied");
			setTimeout(() => button.classList.remove("copied"), 1500);
		});
	}
}
