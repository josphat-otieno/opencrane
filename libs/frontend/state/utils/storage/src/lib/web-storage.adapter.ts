import { Injectable } from "@angular/core";

import { StorageGateway } from "./storage.types";

/**
 * Safely wraps a native browser storage object, degrading to no-op
 * when the storage API is unavailable or throws.
 */
class _SafeWebStorageAdapter implements StorageGateway
{
	/** Initialize with a getter for the native store. */
	constructor(private readonly _getNativeStore: () => Storage | null)
	{
	}

	/** Get a value safely. */
	public getItem(key: string): string | null
	{
		const store = this._storage();
		return store ? store.getItem(key) : null;
	}

	/** Set a value safely. */
	public setItem(key: string, value: string): void
	{
		const store = this._storage();
		if (store)
		{
			try
			{
				store.setItem(key, value);
			}
			catch
			{
				// Ignore quota exceeded or other write errors
			}
		}
	}

	/** Remove a value safely. */
	public removeItem(key: string): void
	{
		const store = this._storage();
		if (store)
		{
			try
			{
				store.removeItem(key);
			}
			catch
			{
				// Ignore deletion errors
			}
		}
	}

	/** Try to get the storage object. */
	private _storage(): Storage | null
	{
		try
		{
			return this._getNativeStore();
		}
		catch
		{
			return null;
		}
	}
}

/**
 * Web-platform implementation of `LOCAL_STORAGE_GATEWAY`.
 */
@Injectable()
export class WebLocalStorageAdapter extends _SafeWebStorageAdapter
{
	/** Initialize local storage. */
	constructor()
	{
		super(() => (typeof localStorage !== "undefined" ? localStorage : null));
	}
}

/**
 * Web-platform implementation of `SESSION_STORAGE_GATEWAY`.
 */
@Injectable()
export class WebSessionStorageAdapter extends _SafeWebStorageAdapter
{
	/** Initialize session storage. */
	constructor()
	{
		super(() => (typeof sessionStorage !== "undefined" ? sessionStorage : null));
	}
}
