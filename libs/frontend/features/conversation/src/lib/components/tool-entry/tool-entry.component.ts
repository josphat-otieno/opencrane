import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";

import { MessageCard } from "@opencrane/core";
import { FileArtifact, extractFileArtifact, formatCollapsedToolPreviewText } from "@opencrane/state/conversation/render";

import { CopyCodeDirective } from "../../directives/copy-code.directive";
import { MarkdownPipe } from "../../pipes/markdown.pipe";
import { FilePreviewService } from "../../services/file-preview.service";

/** Fence a raw payload as a markdown code block so the one shared pipeline renders/collapses it. */
function _fence(text: string): string
{
	const trimmed = text.trim();
	const looksJson =
		(trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
	const lang = looksJson ? "json" : "";
	let body = text;
	if (looksJson)
	{
		try
		{
			body = JSON.stringify(JSON.parse(trimmed), null, 2);
		}
		catch
		{
			body = text;
		}
	}
	return "```" + lang + "\n" + body + "\n```";
}

/**
 * One tool call, rendered as a single compact row: icon · name · input preview · status.
 * The row collapses input and output under one command (the preview is the input's first
 * chars); expanding it reveals the full input and output blocks, routed through the shared
 * markdown pipeline. Errors get error styling. Used both on its own (a lone tool call) and
 * as a line inside a {@link ToolGroupComponent} "Called N tools" run.
 *
 * A file-bearing call (a `read`, or a `write`/`edit`) is special-cased: instead of dumping
 * the file inline, the row shows a compact file reference and portals the content to the
 * side {@link FilePanelComponent} via {@link FilePreviewService}.
 */
@Component({
	selector: "wo-tool-entry",
	standalone: true,
	imports: [MarkdownPipe, CopyCodeDirective],
	templateUrl: "./tool-entry.component.html",
	styleUrl: "./tool-entry.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToolEntryComponent
{
	/** Portals a file-bearing call's content to the side panel. */
	private readonly _filePreview = inject(FilePreviewService);

	/** The tool card to render. */
	public readonly card = input.required<MessageCard>();

	/** Whether the detail (input + output) is expanded (collapsed by default). */
	public readonly open = signal<boolean>(false);

	/** Whether this result is an error (drives error styling). */
	public readonly errored = computed<boolean>(() => this.card().isError === true);

	/** The file this call reads or writes, or null for a non-file tool (rendered inline). */
	public readonly fileArtifact = computed<FileArtifact | null>(() =>
	{
		const card = this.card();
		return extractFileArtifact(card.label, card.content, card.output);
	});

	/** The input preview (first chars) shown on the collapsed row. */
	public readonly detail = computed<string>(() => formatCollapsedToolPreviewText(this.card().content) ?? "");

	/** Whether there is any input or output body worth expanding to. */
	public readonly hasBody = computed<boolean>(() =>
	{
		const card = this.card();
		return (card.content ?? "").length > 0 || (card.output ?? "").length > 0;
	});

	/** The tool input fenced as markdown, or "" when absent. */
	public readonly inputMarkdown = computed<string>(() =>
	{
		const content = this.card().content;
		return content ? _fence(content) : "";
	});

	/** The tool output fenced as markdown, or "" when absent. */
	public readonly outputMarkdown = computed<string>(() =>
	{
		const output = this.card().output;
		return output ? _fence(output) : "";
	});

	/** Toggle the expanded state (no-op when there is no body). */
	public toggle(): void
	{
		if (this.hasBody())
		{
			this.open.update((open: boolean): boolean => !open);
		}
	}

	/** Portal a file-bearing call's content to the side panel. */
	public openFile(file: FileArtifact): void
	{
		this._filePreview.open(file);
	}
}
