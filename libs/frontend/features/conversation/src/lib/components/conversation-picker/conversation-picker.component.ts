import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";

import { AgentOption, ModelOption } from "@opencrane/core";
import { CONVERSATION_GATEWAY } from "@opencrane/state/core";

/**
 * Header pill + dropdown for choosing the agent a session sends to, with the
 * pod's model catalogue shown for reference.
 *
 * Agents are functional — selecting one sets `selectedAgentId` on the gateway,
 * which travels as `agentId` on `chat.send`/`chat.abort`. Models are read-only
 * here (a model is agent config, not a per-message parameter), surfaced so the
 * `models.list` catalogue is visible. Both catalogues load lazily on first open.
 */
@Component({
	selector: "wo-conversation-picker",
	standalone: true,
	imports: [],
	templateUrl: "./conversation-picker.component.html",
	styleUrl: "./conversation-picker.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationPickerComponent
{
	private readonly _gateway = inject(CONVERSATION_GATEWAY);

	/** Whether the dropdown is open. */
	public readonly open = signal<boolean>(false);

	/** Loaded model catalogue (empty until first open). */
	public readonly models = signal<ModelOption[]>([]);

	/** Loaded agent catalogue (empty until first open). */
	public readonly agents = signal<AgentOption[]>([]);

	/** Whether the catalogues have been fetched at least once. */
	public readonly loaded = signal<boolean>(false);

	/** The agent selected for sends (null → pod default). */
	public readonly selectedAgentId = this._gateway.selectedAgentId;

	/** Label for the trigger pill — the selected agent's name, or "Auto". */
	public readonly label = computed<string>(() =>
	{
		const id = this.selectedAgentId();
		if (!id)
		{
			return "Auto";
		}
		return this.agents().find((a: AgentOption): boolean => a.id === id)?.name ?? id;
	});

	/** Toggle the dropdown, loading the catalogues on first open. */
	public toggle(): void
	{
		const next = !this.open();
		this.open.set(next);
		if (next && !this.loaded())
		{
			void this._load();
		}
	}

	/** Close the dropdown (backdrop / after a selection). */
	public close(): void
	{
		this.open.set(false);
	}

	/** Select an agent (or clear to the pod default) and close. */
	public choose(agentId: string | null): void
	{
		this._gateway.selectAgent(agentId);
		this.close();
	}

	/** Fetch the model + agent catalogues once. */
	private async _load(): Promise<void>
	{
		const [models, agents] = await Promise.all([this._gateway.listModels(), this._gateway.listAgents()]);
		this.models.set(models);
		this.agents.set(agents);
		this.loaded.set(true);
	}
}
