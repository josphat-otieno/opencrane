import type { Provider } from "@angular/core";

import { APPROVAL_DECISION_GATEWAY, OpenCraneApprovalDecisionGateway } from "@opencrane/state/approvals/adapter";
import { CONVERSATION_HISTORY_GATEWAY, CONVERSATION_PROGRESS_GATEWAY, CONVERSATION_REPLAY_GATEWAY, CONVERSATION_RUN_GATEWAY, CONVERSATION_SUBMISSION_GATEWAY, OpenCraneConversationHistoryGateway, OpenCraneConversationProgressGateway, OpenCraneConversationReplayReader, OpenCraneConversationRunGateway, OpenCraneConversationSubmissionGateway } from "@opencrane/state/conversation/adapter";
import { MCP_GATEWAY, OpenCraneMcpGateway } from "@opencrane/state/mcp/adapter";
import { OpenCraneProviderKeyGateway, PROVIDER_KEY_GATEWAY } from "@opencrane/state/provider-key/adapter";
import { OpenCranePersonalAssetsGateway, PERSONAL_ASSETS_GATEWAY } from "@opencrane/state/assets/adapter";
import { OpenCraneSkillCatalogueGateway, SKILL_CATALOGUE_GATEWAY } from "@opencrane/state/skills/adapter";

import { GATEWAY_MODE } from "./gateway-mode.types";

/**
 * Binds every swappable data gateway the **opencrane-ui** app (org-admin
 * console) consumes to their live OpenCrane implementations. All targets are on
 * the Control Plane API (per-tenant/org surface).
 *
 * All gateways are live — there is no mock mode in production code. To test
 * with in-memory fakes use `provideTestGateways` from the `__test__` package.
 *
 * @returns The DI providers to spread into the app's `providers` array.
 */
export function provideControlPlaneGateways(): Provider[]
{
	return [
		{ provide: GATEWAY_MODE, useValue: "live" },
		{ provide: CONVERSATION_HISTORY_GATEWAY, useClass: OpenCraneConversationHistoryGateway },
		{ provide: CONVERSATION_REPLAY_GATEWAY, useClass: OpenCraneConversationReplayReader },
		{ provide: CONVERSATION_SUBMISSION_GATEWAY, useClass: OpenCraneConversationSubmissionGateway },
		{ provide: CONVERSATION_RUN_GATEWAY, useClass: OpenCraneConversationRunGateway },
		{ provide: CONVERSATION_PROGRESS_GATEWAY, useClass: OpenCraneConversationProgressGateway },
		{ provide: APPROVAL_DECISION_GATEWAY, useClass: OpenCraneApprovalDecisionGateway },
		{ provide: MCP_GATEWAY, useClass: OpenCraneMcpGateway },
		{ provide: PROVIDER_KEY_GATEWAY, useClass: OpenCraneProviderKeyGateway },
		{ provide: PERSONAL_ASSETS_GATEWAY, useClass: OpenCranePersonalAssetsGateway },
		{ provide: SKILL_CATALOGUE_GATEWAY, useClass: OpenCraneSkillCatalogueGateway }
	];
}
