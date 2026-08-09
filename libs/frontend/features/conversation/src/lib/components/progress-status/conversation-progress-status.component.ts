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
		switch (state)
		{
			case ConversationProgressStates.RefreshFailed:
			case ConversationProgressStates.Failed:
				return "alert";
			case ConversationProgressStates.Idle:
			case ConversationProgressStates.LoadingReplay:
			case ConversationProgressStates.RunAdmitted:
			case ConversationProgressStates.Running:
			case ConversationProgressStates.WaitingForApproval:
			case ConversationProgressStates.Refreshing:
			case ConversationProgressStates.Reconnecting:
			case ConversationProgressStates.Completed:
			case ConversationProgressStates.Cancelled:
				return "status";
		}
		const unhandled: never = state;
		return unhandled;
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
		switch (state)
		{
			case ConversationProgressStates.LoadingReplay:
				return "Loading conversation";
			case ConversationProgressStates.RunAdmitted:
				return "Waiting for OpenCrane";
			case ConversationProgressStates.Running:
				return "Running";
			case ConversationProgressStates.WaitingForApproval:
				return "Waiting for approval";
			case ConversationProgressStates.Refreshing:
				return "Refreshing";
			case ConversationProgressStates.Reconnecting:
				return "Reconnecting";
			case ConversationProgressStates.RefreshFailed:
				return "Refresh failed";
			case ConversationProgressStates.Completed:
				return "Completed";
			case ConversationProgressStates.Cancelled:
				return "Cancelled";
			case ConversationProgressStates.Failed:
				return "Failed";
			case ConversationProgressStates.Idle:
				return "";
		}
		const unhandled: never = state;
		return unhandled;
	}
}
