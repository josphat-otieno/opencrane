import { InjectionToken } from "@angular/core";

import { SessionSummary, ThreadMessage } from "@opencrane/core";

/** A locally-persisted snapshot of one thread's transcript. */
export interface CachedThread
{
	/** Thread/session id this snapshot belongs to. */
	threadId: string;

	/** The cached messages (the most-recent window that was on screen). */
	messages: ThreadMessage[];

	/** When the snapshot was written (epoch ms). */
	updatedAt: number;
}

/** A locally-persisted snapshot of one tenant's session list (the sidebar). */
export interface CachedSessions
{
	/** Tenant key (pod/owner) this list belongs to. */
	tenantKey: string;

	/** The cached session summaries (last seen from `sessions.list`). */
	sessions: SessionSummary[];

	/** When the snapshot was written (epoch ms). */
	updatedAt: number;
}

/**
 * Local persistence for conversation transcripts.
 *
 * Lets a thread paint instantly from the last-seen state on reopen — and
 * survive a reload or brief offline — before the live gateway reconciles with
 * the pod. The gateway treats the cache as a hint: cached messages are shown
 * only until a fresh `chat.history` fetch supersedes them.
 *
 * The web build provides an IndexedDB implementation; a desktop build can bind
 * the same token to a filesystem/SQLite store (the platform seam), so feature
 * and gateway code never depend on the concrete storage.
 */
export interface ConversationCache
{
	/** Load the cached transcript for a thread, or null when none is stored. */
	load(threadId: string): Promise<CachedThread | null>;

	/** Persist (replacing any prior snapshot) the transcript for a thread. */
	save(threadId: string, messages: ThreadMessage[]): Promise<void>;

	/** Load the cached session list for a tenant, or null when none is stored. */
	loadSessions(tenantKey: string): Promise<SessionSummary[] | null>;

	/** Persist (replacing any prior snapshot) the session list for a tenant. */
	saveSessions(tenantKey: string, sessions: SessionSummary[]): Promise<void>;

	/** Drop one thread's cache, or the entire store (transcripts + sessions) when no id is given. */
	clear(threadId?: string): Promise<void>;
}

/** DI token for the active ConversationCache implementation. */
export const CONVERSATION_CACHE: InjectionToken<ConversationCache> = new InjectionToken<ConversationCache>("WO_CONVERSATION_CACHE");
