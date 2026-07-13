import { Provider } from "@angular/core";

import { PLATFORM_BRIDGE } from "./platform-bridge.token";
import { BoundFolder, PlatformBridge } from "./platform-bridge.types";

/**
 * Browser implementation of PlatformBridge.
 *
 * The web app has no native filesystem access, so desktop-only capabilities
 * report as unsupported. The future desktop app replaces this provider with an
 * Electron/Tauri-backed implementation.
 */
export class WebPlatformBridge implements PlatformBridge
{
	/** Web is never a desktop shell. */
	public readonly isDesktop: boolean = false;

	/** Folder binding requires the desktop shell; unsupported on the web. */
	public bindFolder(_projectId: string): Promise<BoundFolder>
	{
		return Promise.reject(new Error("Folder binding is only available in the WeOwnAI desktop app."));
	}
}

/** Provides the web PlatformBridge implementation. */
export function provideWebPlatform(): Provider
{
	return { provide: PLATFORM_BRIDGE, useClass: WebPlatformBridge };
}
