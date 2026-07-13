import { Injectable, Signal, computed, inject, signal } from "@angular/core";

import { AgentOption, MessageCardKind, ModelOption, SessionSummary, ThreadData, ThreadMessage } from "@opencrane/core";
import { EMPTY_THREAD, SESSIONS, THREADS } from "@opencrane/core/testing";
import { CONVERSATION_CACHE, ConnectionStatus, ConversationGateway } from "@opencrane/state/core";

const _BACKLOG_SIZE = 48;
const _MOCK_PAGE = 12;
const _MOCK_LATENCY_MS = 400;

/** In-memory ConversationGateway for tests — never imported by production code. */
@Injectable()
export class MockConversationGateway implements ConversationGateway
{
	private readonly _status = signal<ConnectionStatus>(ConnectionStatus.Idle);
	private readonly _thread = signal<ThreadData>(EMPTY_THREAD);
	private readonly _messages = signal<ThreadMessage[]>([]);
	private readonly _typing = signal<boolean>(false);
	private readonly _loadingHistory = signal<boolean>(false);
	private readonly _all = signal<ThreadMessage[]>([]);
	private readonly _window = signal<number>(_MOCK_PAGE);
	private readonly _operation = signal<string | null>(null);
	private readonly _selectedAgentId = signal<string | null>(null);
	private readonly _cache = inject(CONVERSATION_CACHE, { optional: true });
	private _threadId = "";
	private _seq = 0;
	private _replyTimer: ReturnType<typeof setTimeout> | null = null;

	public readonly status: Signal<ConnectionStatus> = this._status.asReadonly();
	public readonly thread: Signal<ThreadData> = this._thread.asReadonly();
	public readonly messages: Signal<ThreadMessage[]> = this._messages.asReadonly();
	public readonly typing: Signal<boolean> = this._typing.asReadonly();
	public readonly loadingHistory: Signal<boolean> = this._loadingHistory.asReadonly();
	public readonly hasMoreHistory: Signal<boolean> = computed((): boolean => this._window() < this._all().length);
	public readonly operation: Signal<string | null> = this._operation.asReadonly();
	public readonly selectedAgentId: Signal<string | null> = this._selectedAgentId.asReadonly();
	private readonly _sessions = signal<SessionSummary[]>(SESSIONS.map(function copy(s: SessionSummary): SessionSummary { return { ...s }; }));
	public readonly sessions: Signal<SessionSummary[]> = this._sessions.asReadonly();

	public listSessions(): Promise<SessionSummary[]>
	{
		return Promise.resolve(this._sessions());
	}

	public ensureConnected(): void
	{
		// The mock is always "connected"; sessions are seeded eagerly.
	}

	public open(threadId: string): void
	{
		const thread = THREADS[threadId] ?? EMPTY_THREAD;
		const all = [...this._buildBacklog(threadId), ...thread.messages];
		this._threadId = threadId;
		this._all.set(all);
		this._window.set(Math.min(_MOCK_PAGE, all.length));
		this._thread.set(thread);
		this._typing.set(false);
		this._status.set(ConnectionStatus.Open);
		this._applyWindow();
		void this._restoreFromCache(threadId);
	}

	private async _restoreFromCache(threadId: string): Promise<void>
	{
		if (!this._cache) return;
		const cached = await this._cache.load(threadId);
		if (cached && this._threadId === threadId && cached.messages.length > 0)
		{
			this._window.set(Math.min(cached.messages.length, this._all().length));
			this._messages.set(cached.messages);
		}
	}

	private _persist(): void { void this._cache?.save(this._threadId, this._messages()); }

	public history(): Promise<void>
	{
		this._window.set(Math.min(_MOCK_PAGE, this._all().length));
		this._applyWindow();
		return Promise.resolve();
	}

	public loadOlder(): Promise<void>
	{
		if (this._loadingHistory() || !this.hasMoreHistory()) return Promise.resolve();
		this._loadingHistory.set(true);
		let resolveFn!: () => void;
		const p = new Promise<void>(function s(r): void { resolveFn = r; });
		setTimeout(this._revealOlder.bind(this, resolveFn), _MOCK_LATENCY_MS);
		return p;
	}

	private _revealOlder(resolve: () => void): void
	{
		const cap = this._all().length;
		this._window.update(function grow(c: number): number { return Math.min(c + _MOCK_PAGE, cap); });
		this._applyWindow();
		this._persist();
		this._loadingHistory.set(false);
		resolve();
	}

	private _applyWindow(): void
	{
		const all = this._all();
		this._messages.set(all.slice(Math.max(0, all.length - this._window())));
	}

	private _buildBacklog(threadId: string): ThreadMessage[]
	{
		const backlog: ThreadMessage[] = [];
		for (let i = 0; i < _BACKLOG_SIZE; i++)
		{
			const isUser = i % 2 === 0;
			const min = (i % 60).toString().padStart(2, "0");
			backlog.push({ id: `${threadId}-bk-${i}`, role: isUser ? "user" : "assistant", author: isUser ? "Alex Kim" : undefined, time: `09:${min}`, cards: [{ type: MessageCardKind.Text, content: isUser ? `Earlier question #${i + 1}.` : `Earlier reply #${i + 1}.` }] });
		}
		return backlog;
	}

	public send(text: string): void
	{
		const trimmed = text.trim();
		if (!trimmed) return;
		const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
		this._appendMessage({ id: `${this._threadId}-live-${this._seq++}`, role: "user", author: "Alex Kim", time: now, cards: [{ type: MessageCardKind.Text, content: trimmed }] });
		this._typing.set(true);
		this._replyTimer = setTimeout(this._fakeReply.bind(this), 1100);
	}

	private _fakeReply(): void
	{
		this._replyTimer = null;
		const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
		this._appendMessage({ id: `${this._threadId}-live-${this._seq++}`, role: "assistant", time: t, cards: [{ type: MessageCardKind.Text, content: "Mock gateway — wire the OpenClaw pod transport for live replies." }] });
		this._typing.set(false);
	}

	public abort(): void
	{
		if (this._replyTimer !== null)
		{
			clearTimeout(this._replyTimer);
			this._replyTimer = null;
		}
		this._typing.set(false);
	}

	public sendCanvasAction(_action: unknown): void
	{
		// Mock: A2UI canvas actions have no server to return to.
	}

	public listModels(): Promise<ModelOption[]>
	{
		return Promise.resolve([
			{ id: "claude-sonnet-4-6", name: "Sonnet 4.6", provider: "anthropic" },
			{ id: "claude-opus-4-8", name: "Opus 4.8", provider: "anthropic" }
		]);
	}

	public listAgents(): Promise<AgentOption[]>
	{
		return Promise.resolve([{ id: "main", name: "Assistant" }]);
	}

	public selectAgent(agentId: string | null): void
	{
		this._selectedAgentId.set(agentId && agentId.length > 0 ? agentId : null);
	}

	public getMessage(messageId: string): Promise<ThreadMessage | null>
	{
		return Promise.resolve(this._all().find((m: ThreadMessage): boolean => m.id === messageId) ?? null);
	}

	private _appendMessage(m: ThreadMessage): void
	{
		this._all.update(function a(c: ThreadMessage[]): ThreadMessage[] { return [...c, m]; });
		this._window.update(function g(c: number): number { return c + 1; });
		this._applyWindow();
		this._persist();
	}
}
