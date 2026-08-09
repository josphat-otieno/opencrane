import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core";

import { ConversationProgressStates } from "@opencrane/state/conversation/adapter";

/** Feature-local status strip for bounded OpenCrane conversation progress. */
@Component({
	selector: "wo-conversation-progress-status",
	standalone: true,
	templateUrl: "./conversation-progress-status.component.html",
	styleUrl: "./conversation-progress-status.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationProgressStatusComponent
{
	/** Current derived progress state. */
	public readonly state = input<ConversationProgressStates>(ConversationProgressStates.Idle);

	/** Optional detail supplied by the progress controller. */
	public readonly detail = input<string | null>(null);

	/** Whether the user can retry the failed refresh. */
	public readonly retryable = input<boolean>(false);

	/** Retry intent emitted to the route orchestrator. */
	public readonly retryRequested = output<void>();

	/** Whether this component should render for the current state. */
	public readonly visible = computed(this._visible.bind(this));

	/** Accessible live-region role for the current state. */
	public readonly role = computed(this._role.bind(this));

	/** Live-region politeness for the current state. */
	public readonly ariaLive = computed(this._ariaLive.bind(this));

	/** Short progress label. */
	public readonly label = computed(this._label.bind(this));

	/** Emit retry intent. */
	public retry(): void
	{
		if (!this.retryable()) return;
		this.retryRequested.emit();
	}

	/** Hide the strip when there is no progress to report. */
	private _visible(): boolean
	{
		return this.state() !== ConversationProgressStates.Idle;
	}

	/** Use assertive announcements only for failures that need attention. */
	private _role(): "status" | "alert"
	{
		const state = this.state();
		return _PROGRESS_ROLES[state];
	}

	/** Announce failures promptly while keeping normal progress low-noise. */
	private _ariaLive(): "polite" | "assertive"
	{
		return this.role() === "alert" ? "assertive" : "polite";
	}

	/** Convert state enum into OpenCrane user-facing copy. */
	private _label(): string
	{
		const state = this.state();
		return _PROGRESS_LABELS[state];
	}
}

/** Exhaustive accessible-role mapping for status-strip progress states. */
const _PROGRESS_ROLES: Record<ConversationProgressStates, "status" | "alert"> = {
	[ConversationProgressStates.Idle]: "status",
	[ConversationProgressStates.LoadingReplay]: "status",
	[ConversationProgressStates.RunAdmitted]: "status",
	[ConversationProgressStates.Running]: "status",
	[ConversationProgressStates.WaitingForApproval]: "status",
	[ConversationProgressStates.Refreshing]: "status",
	[ConversationProgressStates.Reconnecting]: "status",
	[ConversationProgressStates.Completed]: "status",
	[ConversationProgressStates.Cancelled]: "status",
	[ConversationProgressStates.RefreshFailed]: "alert",
	[ConversationProgressStates.Failed]: "alert"
};

/** Exhaustive label mapping for status-strip progress states. */
const _PROGRESS_LABELS: Record<ConversationProgressStates, string> = {
	[ConversationProgressStates.Idle]: "",
	[ConversationProgressStates.LoadingReplay]: "Loading conversation",
	[ConversationProgressStates.RunAdmitted]: "Waiting for OpenCrane",
	[ConversationProgressStates.Running]: "Running",
	[ConversationProgressStates.WaitingForApproval]: "Waiting for approval",
	[ConversationProgressStates.Refreshing]: "Refreshing",
	[ConversationProgressStates.Reconnecting]: "Reconnecting",
	[ConversationProgressStates.Completed]: "Completed",
	[ConversationProgressStates.Cancelled]: "Cancelled",
	[ConversationProgressStates.RefreshFailed]: "Refresh failed",
	[ConversationProgressStates.Failed]: "Failed"
};
