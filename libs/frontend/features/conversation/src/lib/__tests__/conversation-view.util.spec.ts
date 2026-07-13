import { describe, expect, it } from "vitest";

import { ConnectionStatus } from "@opencrane/state/core";
import { ConversationViewState, _ToConversationViewState } from "../conversation-view.util";

describe("_ToConversationViewState", () =>
{
	it("maps Refused to NoWorkspace (terminal — no composer, no reconnect)", () =>
	{
		expect(_ToConversationViewState(ConnectionStatus.Refused)).toBe(ConversationViewState.NoWorkspace);
	});

	it("maps Provisioning to its own transient state, distinct from the terminal NoWorkspace", () =>
	{
		expect(_ToConversationViewState(ConnectionStatus.Provisioning)).toBe(ConversationViewState.Provisioning);
		expect(_ToConversationViewState(ConnectionStatus.Provisioning)).not.toBe(ConversationViewState.NoWorkspace);
	});

	it("maps every transport status to Active so a transient disconnect never hides the conversation", () =>
	{
		const active: ConnectionStatus[] = [ConnectionStatus.Idle, ConnectionStatus.Connecting, ConnectionStatus.Open, ConnectionStatus.Closed];
		for (const status of active)
		{
			expect(_ToConversationViewState(status)).toBe(ConversationViewState.Active);
		}
	});
});
