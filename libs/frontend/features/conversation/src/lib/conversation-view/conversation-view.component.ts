import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from "@angular/core";

import { SCOPE_COLORS, ScopeLevel } from "@opencrane/core";
import { CONVERSATION_GATEWAY, ConnectionStatus } from "@opencrane/state/core";
import { StreamBlock, _BuildStreamBlocks } from "@opencrane/state/conversation/render";
import { ConversationViewState, _ToConversationViewState } from "../conversation-view.util";
import { ConversationPickerComponent } from "../components/conversation-picker/conversation-picker.component";
import { MessageItemComponent } from "../components/message-item/message-item.component";
import { ToolGroupComponent } from "../components/tool-group/tool-group.component";
import { SharePanelComponent } from "../components/share-panel/share-panel.component";
import { FilePreviewService } from "../services/file-preview.service";

/** Distance (px) from the top of the stream that triggers an older-history load. */
const _LOAD_OLDER_THRESHOLD = 80;

/** A scope label + colour pair for the header rail. */
interface HeaderScope
{
	/** Scope label. */
	label: string;
	/** Scope colour. */
	color: string;
}

/** Centre pane: thread header, message stream, and composer. */
@Component({
	selector: "wo-conversation-view",
	standalone: true,
	imports: [ConversationPickerComponent, MessageItemComponent, ToolGroupComponent, SharePanelComponent],
	templateUrl: "./conversation-view.component.html",
	styleUrl: "./conversation-view.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationViewComponent
{
	/** Active thread id. Empty string selects the blank "new session" composer. */
	public readonly threadId = input.required<string>();

	/**
	 * First message to send once a freshly-minted session opens. Set only when the
	 * host navigated here from the new-session composer; sent exactly once.
	 */
	public readonly initialMessage = input<string>();

	/** Whether the context panel is open (toggle button state). */
	public readonly contextOpen = input<boolean>(true);

	/** Emits when the context-panel toggle is clicked. */
	public readonly toggleContext = output<void>();

	/**
	 * Emits the first message typed into the blank new-session composer. The host
	 * mints a session id and deep-links to it (no thread is open here yet).
	 */
	public readonly startSession = output<string>();

	/** True for the blank new-session composer — no thread selected yet. */
	public readonly isDraft = computed<boolean>(() => this.threadId().length === 0);

	/** Guards the one-shot send of {@link initialMessage} after the new thread opens. */
	private _sentInitial = false;

	/** Live conversation runtime (mock until the pod transport is wired). */
	private readonly _gateway = inject(CONVERSATION_GATEWAY);

	/** Side file panel — closed on thread switch so a prior thread's file doesn't linger. */
	private readonly _filePreview = inject(FilePreviewService);

	/** Thread metadata for the open thread. */
	public readonly thread = this._gateway.thread;

	/** Stream messages for the open thread. */
	public readonly messages = this._gateway.messages;

	/**
	 * Messages to render in the stream. Empty in the draft (new-session) state: the
	 * gateway singleton keeps the previously-open thread's messages, but the blank
	 * composer must not show them, so it always renders an empty stream.
	 */
	public readonly displayMessages = computed(() => this.isDraft() ? [] : this.messages());

	/**
	 * The stream folded into render blocks (the transformation lives in state — see
	 * {@link _BuildStreamBlocks}): consecutive tool-only messages coalesce into one grouped
	 * disclosure. The draft/blank policy stays here (a view concern) via {@link displayMessages}.
	 */
	public readonly streamBlocks = computed<StreamBlock[]>(() => _BuildStreamBlocks(this.displayMessages()));

	/** Whether the assistant is composing a reply. */
	public readonly typing = this._gateway.typing;

	/** Inline status of a long-running operation (e.g. compaction), or null. */
	public readonly operation = this._gateway.operation;

	/** Whether the socket dropped and the gateway is retrying (drives the offline banner). */
	public readonly isReconnecting = computed<boolean>(() => this._gateway.status() === ConnectionStatus.Reconnecting);

	/**
	 * Enum-first centre-pane state derived from the live connection status. Drives
	 * the terminal "no workspace" notice (HTTP 403/409 from the pod broker) versus
	 * the normal transcript surface — see {@link ConversationViewState}.
	 */
	public readonly viewState = computed<ConversationViewState>(() => _ToConversationViewState(this._gateway.status()));

	/** Exposes the view-state enum to the template (enum-first, no magic strings). */
	protected readonly ConversationViewState = ConversationViewState;

	/**
	 * Whether the live gateway socket is open — i.e. a message can actually be sent
	 * right now. Sends before this drop silently, so the composer gates on it.
	 */
	public readonly ready = computed<boolean>(() => this._gateway.status() === ConnectionStatus.Open);

	/**
	 * Whether an open thread is still establishing its socket (post-broker, pre
	 * `hello-ok`). Drives the "connecting to your workspace" affordance so the pane
	 * never looks ready-to-chat while sends would be lost. Never true in the draft
	 * composer (which mints a session on send rather than needing a live socket).
	 */
	public readonly connecting = computed<boolean>(() =>
	{
		if (this.isDraft())
		{
			return false;
		}
		const status = this._gateway.status();
		return status === ConnectionStatus.Idle || status === ConnectionStatus.Connecting;
	});

	/** Whether an open thread's socket has dropped (sends would be lost until it returns). */
	public readonly disconnected = computed<boolean>(() => !this.isDraft() && this._gateway.status() === ConnectionStatus.Closed);

	/** Whether older history can still be loaded (drives the scroll-up affordance). */
	public readonly hasMoreHistory = this._gateway.hasMoreHistory;

	/** Whether an older-history page is currently loading. */
	public readonly loadingHistory = this._gateway.loadingHistory;

	/** The scrollable message stream element. */
	private readonly _stream = viewChild<ElementRef<HTMLElement>>("stream");

	/** Injector used to schedule post-render scroll adjustments. */
	private readonly _injector = inject(Injector);

	/** True while a scroll evaluation is already queued for the next frame. */
	private _scrollScheduled = false;

	/** True for the one scroll event our own anchor restore triggers (ignored). */
	private _suppressScroll = false;

	/** Composer draft text. */
	public readonly draft = signal<string>("");

	/** Share popover open state; resets to closed on thread switch. */
	public readonly shareOpen = signal<boolean>(false);

	/** Scope rail labels + colours for the header (dept colour is thread-specific). */
	public readonly headerScopes = computed<HeaderScope[]>(() =>
	[
		{ label: "org", color: SCOPE_COLORS[ScopeLevel.Org] },
		{ label: "dept", color: this.thread().deptColor },
		{ label: "project", color: SCOPE_COLORS[ScopeLevel.Project] },
		{ label: "personal", color: SCOPE_COLORS[ScopeLevel.Personal] }
	]);

	public constructor()
	{
		// Opening a thread is an imperative side effect on the gateway; re-run it
		// only when the routed thread id changes. `open()` reads gateway signals
		// (history window, tenant), so it must run untracked — otherwise those
		// reads become effect dependencies and a later history page reopens the
		// thread, snapping the window back.
		effect(() =>
		{
			const threadId = this.threadId();
			untracked(() =>
			{
				// Draft (root) route: no thread to open — just render the blank composer.
				if (threadId.length === 0)
				{
					return;
				}
				this._gateway.open(threadId);
				this.shareOpen.set(false);
				this._filePreview.close();
				this._scrollToBottomAfterRender();
			});
		});

		// A session created from the new-session composer carries its first message
		// across the navigation. Send it once — but only after the socket is open:
		// a send before the gateway is ready is dropped, so we wait for `ready()`
		// (which flips true on `hello-ok`) rather than firing right after `open()`.
		effect(() =>
		{
			const initial = this.initialMessage();
			const ready = this.ready();
			untracked(() =>
			{
				if (!initial || this._sentInitial || this.isDraft() || !ready)
				{
					return;
				}
				this._sentInitial = true;
				this._gateway.send(initial);
			});
		});
	}

	/**
	 * Scroll handler — coalesces the high-frequency scroll event onto the next
	 * animation frame so we read layout (and decide whether to load) at most
	 * once per frame, and ignores the synthetic event our own anchor restore
	 * fires so it can't re-trigger a load.
	 */
	public onStreamScroll(): void
	{
		if (this._suppressScroll)
		{
			this._suppressScroll = false;
			return;
		}
		if (this._scrollScheduled)
		{
			return;
		}
		this._scrollScheduled = true;
		requestAnimationFrame(this._evaluateScroll.bind(this));
	}

	/**
	 * Once per frame: if the user is near the top, load older history and keep
	 * the viewport anchored on the same message after the rows are prepended.
	 */
	private _evaluateScroll(): void
	{
		this._scrollScheduled = false;
		const el = this._stream()?.nativeElement;
		if (!el || this.loadingHistory() || !this.hasMoreHistory())
		{
			return;
		}
		if (el.scrollTop > _LOAD_OLDER_THRESHOLD || el.scrollHeight <= el.clientHeight)
		{
			return;
		}
		const previousHeight = el.scrollHeight;
		const previousTop = el.scrollTop;
		void this._gateway.loadOlder().then(() =>
		{
			// After the prepended rows render, shift down by the height they added.
			// Flag the resulting scroll event so onStreamScroll ignores it.
			afterNextRender(() =>
			{
				this._suppressScroll = true;
				el.scrollTop = previousTop + (el.scrollHeight - previousHeight);
			}, { injector: this._injector });
		});
	}

	/** Pin the stream to the latest message once the new thread has rendered. */
	private _scrollToBottomAfterRender(): void
	{
		afterNextRender(() =>
		{
			const el = this._stream()?.nativeElement;
			if (el)
			{
				el.scrollTop = el.scrollHeight;
			}
		}, { injector: this._injector });
	}

	/**
	 * Re-attempt the pod connection — backs the "Retry" affordance on the
	 * transient {@link ConversationViewState.Provisioning} notice. Re-opening the
	 * thread re-runs the `/auth/pod-token` broker, so once the tenant's pod is
	 * paired the workspace surfaces without a full reload.
	 */
	public retry(): void
	{
		this._gateway.open(this.threadId());
	}

	/** Sends the composer draft through the gateway and clears it. */
	public send(): void
	{
		const text = this.draft().trim();
		if (!text)
		{
			return;
		}
		// No thread is open in the new-session composer: hand the first message to
		// the host, which mints a session and deep-links to it (it arrives back as
		// `initialMessage` and is sent once the new thread opens).
		if (this.isDraft())
		{
			this.startSession.emit(text);
			this.draft.set("");
			return;
		}
		this._gateway.send(text);
		this.draft.set("");
	}

	/** Interrupts the in-flight run (`chat.abort`). */
	public stop(): void
	{
		this._gateway.abort();
	}

	/** Return an in-process A2UI canvas user action to the agent (the canvas return path). */
	public onCanvasAction(action: unknown): void
	{
		this._gateway.sendCanvasAction(action);
	}

	/** Sends on Enter (without Shift); Escape stops an in-flight run. */
	public onComposerKeydown(event: KeyboardEvent): void
	{
		if (event.key === "Enter" && !event.shiftKey)
		{
			event.preventDefault();
			this.send();
			return;
		}
		if (event.key === "Escape" && this.typing() && !this.isDraft())
		{
			event.preventDefault();
			this.stop();
		}
	}
}
