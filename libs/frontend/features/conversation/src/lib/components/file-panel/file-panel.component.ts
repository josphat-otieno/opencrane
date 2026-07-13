import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";

import { FileArtifact } from "@opencrane/state/conversation/render";

import { CopyCodeDirective } from "../../directives/copy-code.directive";
import { MarkdownPipe } from "../../pipes/markdown.pipe";

/**
 * The side "File" panel: a file a tool read or wrote, shown on the right of the workspace
 * instead of dumped inline in the thread. Renders the content as a fenced code block through
 * the shared markdown pipeline (syntax highlight + copy button) — a file viewer, so even a
 * markdown file shows its raw source rather than rendering.
 */
@Component({
	selector: "wo-file-panel",
	standalone: true,
	imports: [MarkdownPipe, CopyCodeDirective],
	templateUrl: "./file-panel.component.html",
	styleUrl: "./file-panel.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilePanelComponent
{
	/** The file to display. */
	public readonly file = input.required<FileArtifact>();

	/** Emits when the panel's close control is used. */
	public readonly closed = output<void>();

	/** The file content fenced as a markdown code block for the shared renderer. */
	public readonly contentMarkdown = computed<string>(() =>
	{
		const file = this.file();
		return "```" + file.language + "\n" + file.content + "\n```";
	});
}
