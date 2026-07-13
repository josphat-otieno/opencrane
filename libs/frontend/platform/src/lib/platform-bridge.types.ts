/** Result of binding a local folder to a project (desktop only). */
export interface BoundFolder
{
	/** Absolute path of the bound folder. */
	path: string;
	/** Display label (basename) for the folder. */
	label: string;
}

/**
 * Capabilities that differ by runtime (browser vs desktop).
 *
 * Features depend on this abstraction rather than any concrete runtime, so the
 * web app and a future desktop app (Electron/Tauri) can supply different
 * implementations without the feature code changing.
 */
export interface PlatformBridge
{
	/** Whether the app is running in a desktop shell with native capabilities. */
	readonly isDesktop: boolean;

	/**
	 * Opens a native folder picker and binds the chosen folder to a project.
	 * Desktop-only; the web implementation rejects with an unsupported error.
	 */
	bindFolder(projectId: string): Promise<BoundFolder>;
}
