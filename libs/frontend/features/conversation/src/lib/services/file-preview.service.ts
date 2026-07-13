import { Injectable, Signal, signal } from "@angular/core";

import { FileArtifact } from "@opencrane/state/conversation/render";

/**
 * Holds the file a tool row has "portaled to the side". A file-bearing tool (a `read`, or a
 * `write`/`edit`) shows a compact reference; clicking it calls {@link open}, and the session
 * page renders the side file panel from {@link file}. A root singleton so the producer (the
 * tool row, deep in the conversation tree) and the consumer (the session page) share state
 * without threading outputs up through every intervening component.
 */
@Injectable({ providedIn: "root" })
export class FilePreviewService
{
	/** The file currently shown in the side panel, or null when none is open. */
	private readonly _file = signal<FileArtifact | null>(null);

	/** The file currently shown in the side panel, or null when none is open. */
	public readonly file: Signal<FileArtifact | null> = this._file.asReadonly();

	/** Portal a file to the side panel. */
	public open(file: FileArtifact): void
	{
		this._file.set(file);
	}

	/** Close the side file panel. */
	public close(): void
	{
		this._file.set(null);
	}
}
