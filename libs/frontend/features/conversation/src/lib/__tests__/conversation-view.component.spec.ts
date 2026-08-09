import { readFileSync } from "node:fs";

import { Injector, runInInjectionContext } from "@angular/core";
import { Router } from "@angular/router";
import { describe, expect, it, vi } from "vitest";

import { SessionStore } from "@opencrane/state/core";
import { CONVERSATION_PROGRESS_GATEWAY, CONVERSATION_SUBMISSION_GATEWAY, ConversationMessageRoles, ConversationMessageStates, ConversationProgressStates, ConversationSubmissionFailures, ConversationSubmissionStates, ConversationSubmissionUnavailableReasons, __CreateIdleConversationProgressSnapshot } from "@opencrane/state/conversation/adapter";
import type { ConversationProgressGateway, ConversationProgressRefreshRequest, ConversationProgressSnapshot, ConversationSubmissionGateway } from "@opencrane/state/conversation/adapter";

import { ConversationViewComponent } from "../conversation-view/conversation-view.component";

const _conversationTemplate = readFileSync("src/lib/conversation-view/conversation-view.component.html", "utf8");
const _composerTemplate = readFileSync("src/lib/conversation-composer/conversation-composer.component.html", "utf8");
const _progressTemplate = readFileSync("src/lib/components/progress-status/conversation-progress-status.component.html", "utf8");

describe("ConversationViewComponent", function _Suite()
{
	function _component(displayName: string | null): ConversationViewComponent
	{
		return _componentHarness(displayName).component;
	}

	function _componentHarness(displayName: string | null, submissionGateway?: ConversationSubmissionGateway, progressGateway?: ConversationProgressGateway): { component: ConversationViewComponent; navigate: ReturnType<typeof vi.fn>; progressGateway: ConversationProgressGateway }
	{
		const navigate = vi.fn().mockResolvedValue(true);
		const progress = progressGateway ?? _progressGateway();
		const gateway = submissionGateway ?? _submissionGateway(false);
		const injector = Injector.create({
			providers: [
				{ provide: CONVERSATION_PROGRESS_GATEWAY, useValue: progress },
				{ provide: CONVERSATION_SUBMISSION_GATEWAY, useValue: gateway },
				{ provide: Router, useValue: { navigate } },
				{
					provide: SessionStore,
					useValue: { displayName: function _displayName() { return displayName; } }
				}
			]
		});

		return runInInjectionContext(injector, function _create(): { component: ConversationViewComponent; navigate: ReturnType<typeof vi.fn>; progressGateway: ConversationProgressGateway }
		{
			return { component: new ConversationViewComponent(), navigate, progressGateway: progress };
		});
	}

	it("uses the authenticated display name in the greeting", function _UsesDisplayName()
	{
		expect(_component("Ada Lovelace").displayName()).toBe("Ada Lovelace");
		expect(_component(null).displayName()).toBe("there");
	});

	it("presents unavailable commands as disabled controls", function _PresentsUnavailableControls()
	{
		const template = _conversationTemplate;

		expect(template).not.toContain("sendRequested");
		expect(template).not.toContain("copyLink");
		expect(template).not.toContain("shareRequested");
		expect(template).toContain("<wo-conversation-composer");
		expect(template).toContain("<wo-conversation-progress-status");
		expect(template).toContain("[disabledReason]=\"composerDisabledReason()\"");
		expect(_composerTemplate).toContain("disabled aria-label=\"Add attachment\"");
		expect(_composerTemplate).toContain("[disabled]=\"disabledReason() !== null || pending()\"");
		expect(_composerTemplate).toContain("[disabled]=\"!canSubmit()\"");
	});

	it("composes display-safe messages without a transport dependency", function _ComposesDisplaySafeMessages()
	{
		const componentSource = readFileSync("src/lib/conversation-view/conversation-view.component.ts", "utf8");
		const template = _conversationTemplate;

		expect(componentSource).toContain("CONVERSATION_PROGRESS_GATEWAY");
		expect(componentSource).toContain("CONVERSATION_SUBMISSION_GATEWAY");
		expect(componentSource).toContain("readonly messages: Signal<readonly ConversationMessageView[]>");
		expect(template).toContain("@for (message of messages(); track message.id)");
		expect(template).toContain("<wo-conversation-message [message]=\"message\" />");
		expect(componentSource).not.toContain("HttpClient");
		expect(componentSource).not.toContain("WebSocket");
	});

	it("delegates prompt intent to the submission gateway when the contract is available", async function _DelegatesPromptIntent()
	{
		const submit = vi.fn().mockResolvedValue({ state: ConversationSubmissionStates.Accepted, runId: "run-1", retryable: false });
		const submissionGateway: ConversationSubmissionGateway = {
			availability: function _availability()
			{
				return { canSubmit: true };
			},
			submit
		};
		const { component } = _componentHarness("Ada Lovelace", submissionGateway);

		await component.submitPrompt("Plan the lift");

		expect(submit).toHaveBeenCalledWith({ threadId: null, prompt: "Plan the lift" });
		expect(component.submissionError()).toBeNull();
	});

	it("navigates to the canonical thread when submission resolves a new conversation", async function _NavigatesToResolvedThread()
	{
		const submit = vi.fn().mockResolvedValue({ state: ConversationSubmissionStates.Accepted, threadId: "thread-1", messageId: "message-1", runId: "run-1", retryable: false });
		const submissionGateway: ConversationSubmissionGateway = {
			availability: function _availability()
			{
				return { canSubmit: true };
			},
			submit
		};
		const { component, navigate } = _componentHarness("Ada Lovelace", submissionGateway);

		await component.submitPrompt("Start the work");

		expect(navigate).toHaveBeenCalledWith(["/conversation", "thread-1"], { queryParams: { runId: "run-1" } });
	});

	it("keeps refresh failures visible without deleting existing messages", function _KeepsExistingMessagesOnRefreshFailure()
	{
		const component = _component("Ada Lovelace");
		const replay = { threadId: "thread-1", cursor: "cursor-1", runId: "run-1", customEvents: [], messages: [{ id: "message-1", role: ConversationMessageRoles.Assistant, text: "Already visible", state: ConversationMessageStates.Complete }] };

		component.progress.set({ ...__CreateIdleConversationProgressSnapshot("thread-1"), state: ConversationProgressStates.Reconnecting, runId: "run-1", cursor: "cursor-1", replay, retryable: true, terminal: false });

		expect(component.messages()[0]?.text).toBe("Already visible");
		expect(component.progressRetryable()).toBe(true);
		expect(component.progressDetail()).toBe("Keeping the current messages visible.");
	});

	it("supports opaque thread routes and read-only companion panels", function _SupportsOpaqueRoutes()
	{
		const componentSource = readFileSync("src/lib/conversation-view/conversation-view.component.ts", "utf8");
		const panelTemplate = readFileSync("src/lib/support-panel/conversation-support-panel.component.html", "utf8").toLowerCase();

		expect(componentSource).toContain("readonly threadId = input<string>()");
		expect(componentSource).toContain("readonly runId = input<string>()");
		expect(componentSource).toContain("readonly badge = computed");
		expect(componentSource).toContain("Starting new conversations is not available yet.");
		expect(componentSource).toContain("Message submission is not available yet.");
		expect(componentSource).toContain("Waiting for OpenCrane");
		expect(_conversationTemplate).toContain("Reading canonical replay events.");
		expect(_conversationTemplate).toContain("emptyTitle()");
		expect(_conversationTemplate).toContain("Conversation could not be loaded");
		expect(panelTemplate).toContain("sharing is not available yet");
		expect(panelTemplate).not.toContain("copy session link");
		expect(panelTemplate).not.toContain("pod");
	});

	it("keeps retired runtime concepts out of visible conversation copy", function _KeepsRetiredCopyOut()
	{
		const template = `${_conversationTemplate}\n${_composerTemplate}\n${_progressTemplate}`.toLowerCase();
		const retiredProduct = "open" + "claw";

		expect(template).not.toContain(retiredProduct);
		expect(template).not.toContain("session");
		expect(template).not.toContain("pod token");
		expect(template).not.toContain("gateway");
	});
});

/** Create a submission gateway fixture. */
function _submissionGateway(canSubmit: boolean): ConversationSubmissionGateway
{
	return {
		availability: function _availability()
		{
			if (canSubmit) return { canSubmit: true };
			return { canSubmit: false, reason: ConversationSubmissionUnavailableReasons.ThreadMessageContractMissing };
		},
		submit: async function _submit()
		{
			return { state: ConversationSubmissionStates.Failed, failure: ConversationSubmissionFailures.ThreadMessageContractMissing, retryable: false };
		}
	};
}

/** Create a progress gateway fixture. */
function _progressGateway(): ConversationProgressGateway
{
	const requests: ConversationProgressRefreshRequest[] = [];
	const gateway: ConversationProgressGateway & { readonly requests: ConversationProgressRefreshRequest[] } = {
		requests,
		refresh: async function _refresh(request: ConversationProgressRefreshRequest): Promise<ConversationProgressSnapshot>
		{
			requests.push(request);
			return { ...__CreateIdleConversationProgressSnapshot(request.threadId), state: ConversationProgressStates.Completed };
		}
	};
	return gateway;
}
