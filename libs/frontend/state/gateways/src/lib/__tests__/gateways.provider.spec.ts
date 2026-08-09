import { describe, expect, it } from "vitest";
import type { ClassProvider, InjectionToken, Provider, ValueProvider } from "@angular/core";

import { APPROVAL_DECISION_GATEWAY, OpenCraneApprovalDecisionGateway } from "@opencrane/state/approvals/adapter";
import { CONVERSATION_HISTORY_GATEWAY, CONVERSATION_PROGRESS_GATEWAY, CONVERSATION_REPLAY_GATEWAY, CONVERSATION_RUN_GATEWAY, CONVERSATION_SUBMISSION_GATEWAY, OpenCraneConversationHistoryGateway, OpenCraneConversationProgressGateway, OpenCraneConversationReplayReader, OpenCraneConversationRunGateway, OpenCraneConversationSubmissionGateway } from "@opencrane/state/conversation/adapter";
import { MCP_GATEWAY, OpenCraneMcpGateway } from "@opencrane/state/mcp/adapter";
import { OpenCranePersonalAssetsGateway, PERSONAL_ASSETS_GATEWAY } from "@opencrane/state/assets/adapter";
import { OpenCraneSkillCatalogueGateway, SKILL_CATALOGUE_GATEWAY } from "@opencrane/state/skills/adapter";

import { GATEWAY_MODE } from "../gateway-mode.types";
import { provideControlPlaneGateways } from "../control-plane-gateways.provider";
import {
	MockApprovalDecisionGateway,
	MockMcpGateway,
	MockConversationHistoryGateway,
	MockConversationProgressGateway,
	MockConversationReplayGateway,
	MockConversationRunGateway,
	MockConversationSubmissionGateway,
	MockPersonalAssetsGateway,
	MockSkillCatalogueGateway,
	provideTestGateways
} from "../__test__/test-gateways.provider";

/**
 * Resolves the `useClass` bound to a token within a provider list.
 *
 * @param providers The provider array under test.
 * @param token The injection token to look up.
 * @returns The class bound via `useClass` for that token.
 */
function classFor(providers: Provider[], token: InjectionToken<unknown>): unknown
{
	const match = providers.find(function isToken(provider): provider is ClassProvider
	{
		return typeof provider === "object" && provider !== null && "provide" in provider && provider.provide === token;
	});

	return (match as ClassProvider).useClass;
}

/**
 * Resolves the `useValue` bound to a token within a provider list.
 *
 * @param providers The provider array under test.
 * @param token The injection token to look up.
 * @returns The value bound via `useValue` for that token.
 */
function valueFor(providers: Provider[], token: InjectionToken<unknown>): unknown
{
	const match = providers.find(function isToken(provider): provider is ValueProvider
	{
		return typeof provider === "object" && provider !== null && "provide" in provider && provider.provide === token;
	});

	return (match as ValueProvider).useValue;
}

describe("provideControlPlaneGateways", function _Suite()
{
	it("binds the live opencrane-ui (org-admin) gateways and reports live mode", function _BindsLiveGateways()
	{
		const providers = provideControlPlaneGateways();

		expect(classFor(providers, CONVERSATION_HISTORY_GATEWAY)).toBe(OpenCraneConversationHistoryGateway);
		expect(classFor(providers, CONVERSATION_REPLAY_GATEWAY)).toBe(OpenCraneConversationReplayReader);
		expect(classFor(providers, CONVERSATION_SUBMISSION_GATEWAY)).toBe(OpenCraneConversationSubmissionGateway);
		expect(classFor(providers, CONVERSATION_RUN_GATEWAY)).toBe(OpenCraneConversationRunGateway);
		expect(classFor(providers, CONVERSATION_PROGRESS_GATEWAY)).toBe(OpenCraneConversationProgressGateway);
		expect(classFor(providers, APPROVAL_DECISION_GATEWAY)).toBe(OpenCraneApprovalDecisionGateway);
		expect(classFor(providers, MCP_GATEWAY)).toBe(OpenCraneMcpGateway);
		expect(classFor(providers, PERSONAL_ASSETS_GATEWAY)).toBe(OpenCranePersonalAssetsGateway);
		expect(classFor(providers, SKILL_CATALOGUE_GATEWAY)).toBe(OpenCraneSkillCatalogueGateway);
		expect(valueFor(providers, GATEWAY_MODE)).toBe("live");
	});
});

describe("provideTestGateways", function _Suite()
{
	it("binds every swappable gateway to its in-memory fixture and reports mock mode", function _BindsMockGateways()
	{
		const providers = provideTestGateways();

		expect(classFor(providers, CONVERSATION_HISTORY_GATEWAY)).toBe(MockConversationHistoryGateway);
		expect(classFor(providers, CONVERSATION_REPLAY_GATEWAY)).toBe(MockConversationReplayGateway);
		expect(classFor(providers, CONVERSATION_SUBMISSION_GATEWAY)).toBe(MockConversationSubmissionGateway);
		expect(classFor(providers, CONVERSATION_RUN_GATEWAY)).toBe(MockConversationRunGateway);
		expect(classFor(providers, CONVERSATION_PROGRESS_GATEWAY)).toBe(MockConversationProgressGateway);
		expect(classFor(providers, APPROVAL_DECISION_GATEWAY)).toBe(MockApprovalDecisionGateway);
		expect(classFor(providers, MCP_GATEWAY)).toBe(MockMcpGateway);
		expect(classFor(providers, PERSONAL_ASSETS_GATEWAY)).toBe(MockPersonalAssetsGateway);
		expect(classFor(providers, SKILL_CATALOGUE_GATEWAY)).toBe(MockSkillCatalogueGateway);
		expect(valueFor(providers, GATEWAY_MODE)).toBe("mock");
	});
});
