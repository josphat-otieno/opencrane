import { Injectable } from "@angular/core";

import { SessionSummary, ThreadMessage } from "@opencrane/core";
import { CachedSessions, CachedThread, ConversationCache } from "@opencrane/state/core";

/** IndexedDB database name for WeOwnAI local state. */
const _DB_NAME = "weownai";

/** Schema version — bump when the object stores change (v2 added the sessions store). */
const _DB_VERSION = 2;

/** Object store holding one `CachedThread` per thread, keyed by `threadId`. */
const _STORE = "conversations";

/** Object store holding one `CachedSessions` per tenant, keyed by `tenantKey`. */
const _SESSIONS_STORE = "sessions";

/**
 * Web `ConversationCache` backed by IndexedDB.
 *
 * Each thread's most-recent window is stored as a single `CachedThread` record
 * keyed by `threadId`, so reopening a thread can paint instantly while the live
 * gateway reconnects and re-fetches. All operations are best-effort: if the
 * environment has no IndexedDB (SSR, locked-down browser) every method degrades
 * to a no-op rather than throwing, since the cache is only ever an optimisation.
 */
@Injectable()
export class IndexedDbConversationCache implements ConversationCache
{
	/** Lazily-opened database handle, or null where IndexedDB is unavailable. */
	private _dbPromise: Promise<IDBDatabase | null> | null = null;

	/** @inheritdoc */
	public async load(threadId: string): Promise<CachedThread | null>
	{
		const db = await this._db();
		if (!db)
		{
			return null;
		}
		return new Promise<CachedThread | null>(function read(resolve): void
		{
			const request = db.transaction(_STORE, "readonly").objectStore(_STORE).get(threadId);
			request.onsuccess = function onSuccess(): void
			{
				resolve((request.result as CachedThread | undefined) ?? null);
			};
			request.onerror = function onError(): void
			{
				resolve(null);
			};
		});
	}

	/** @inheritdoc */
	public async save(threadId: string, messages: ThreadMessage[]): Promise<void>
	{
		const db = await this._db();
		if (!db)
		{
			return;
		}
		const record: CachedThread = { threadId, messages, updatedAt: Date.now() };
		await new Promise<void>(function write(resolve): void
		{
			const tx = db.transaction(_STORE, "readwrite");
			tx.objectStore(_STORE).put(record);
			tx.oncomplete = function onComplete(): void
			{
				resolve();
			};
			tx.onerror = function onError(): void
			{
				resolve();
			};
		});
	}

	/** @inheritdoc */
	public async loadSessions(tenantKey: string): Promise<SessionSummary[] | null>
	{
		const db = await this._db();
		if (!db)
		{
			return null;
		}
		return new Promise<SessionSummary[] | null>(function read(resolve): void
		{
			const request = db.transaction(_SESSIONS_STORE, "readonly").objectStore(_SESSIONS_STORE).get(tenantKey);
			request.onsuccess = function onSuccess(): void
			{
				resolve((request.result as CachedSessions | undefined)?.sessions ?? null);
			};
			request.onerror = function onError(): void
			{
				resolve(null);
			};
		});
	}

	/** @inheritdoc */
	public async saveSessions(tenantKey: string, sessions: SessionSummary[]): Promise<void>
	{
		const db = await this._db();
		if (!db)
		{
			return;
		}
		const record: CachedSessions = { tenantKey, sessions, updatedAt: Date.now() };
		await new Promise<void>(function write(resolve): void
		{
			const tx = db.transaction(_SESSIONS_STORE, "readwrite");
			tx.objectStore(_SESSIONS_STORE).put(record);
			tx.oncomplete = function onComplete(): void
			{
				resolve();
			};
			tx.onerror = function onError(): void
			{
				resolve();
			};
		});
	}

	/** @inheritdoc */
	public async clear(threadId?: string): Promise<void>
	{
		const db = await this._db();
		if (!db)
		{
			return;
		}
		// A targeted clear drops just that thread's transcript; a full clear wipes both
		// the transcript and session-list stores.
		const stores = threadId === undefined ? [_STORE, _SESSIONS_STORE] : [_STORE];
		await new Promise<void>(function wipe(resolve): void
		{
			const tx = db.transaction(stores, "readwrite");
			if (threadId === undefined)
			{
				tx.objectStore(_STORE).clear();
				tx.objectStore(_SESSIONS_STORE).clear();
			}
			else
			{
				tx.objectStore(_STORE).delete(threadId);
			}
			tx.oncomplete = function onComplete(): void
			{
				resolve();
			};
			tx.onerror = function onError(): void
			{
				resolve();
			};
		});
	}

	/** Open (once) and memoise the database handle, creating the store on upgrade. */
	private _db(): Promise<IDBDatabase | null>
	{
		if (this._dbPromise)
		{
			return this._dbPromise;
		}
		this._dbPromise = new Promise<IDBDatabase | null>(function open(resolve): void
		{
			if (typeof indexedDB === "undefined")
			{
				resolve(null);
				return;
			}
			const request = indexedDB.open(_DB_NAME, _DB_VERSION);
			request.onupgradeneeded = function onUpgrade(): void
			{
				const db = request.result;
				if (!db.objectStoreNames.contains(_STORE))
				{
					db.createObjectStore(_STORE, { keyPath: "threadId" });
				}
				if (!db.objectStoreNames.contains(_SESSIONS_STORE))
				{
					db.createObjectStore(_SESSIONS_STORE, { keyPath: "tenantKey" });
				}
			};
			request.onsuccess = function onSuccess(): void
			{
				resolve(request.result);
			};
			request.onerror = function onError(): void
			{
				resolve(null);
			};
		});
		return this._dbPromise;
	}
}
