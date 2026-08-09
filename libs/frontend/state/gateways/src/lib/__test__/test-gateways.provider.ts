import type { Provider } from "@angular/core";

import { APPROVAL_DECISION_GATEWAY } from "@opencrane/state/approvals/adapter";
import { CONVERSATION_HISTORY_GATEWAY, CONVERSATION_PROGRESS_GATEWAY, CONVERSATION_REPLAY_GATEWAY, CONVERSATION_RUN_GATEWAY, CONVERSATION_SUBMISSION_GATEWAY } from "@opencrane/state/conversation/adapter";
import { MCP_GATEWAY } from "@opencrane/state/mcp/adapter";
import { PROVIDER_KEY_GATEWAY } from "@opencrane/state/provider-key/adapter";
import { PERSONAL_ASSETS_GATEWAY } from "@opencrane/state/assets/adapter";
import { SKILL_CATALOGUE_GATEWAY } from "@opencrane/state/skills/adapter";

import { GATEWAY_MODE } from "../gateway-mode.types";
import { MockApprovalDecisionGateway } from "./mock-approval-decision-gateway";
import { MockConversationHistoryGateway } from "./mock-conversation-history-gateway";
import { MockConversationProgressGateway } from "./mock-conversation-progress-gateway";
import { MockConversationReplayGateway } from "./mock-conversation-replay-gateway";
import { MockConversationRunGateway } from "./mock-conversation-run-gateway";
import { MockConversationSubmissionGateway } from "./mock-conversation-submission-gateway";
import { MockMcpGateway } from "./mock-mcp-gateway";
import { MockProviderKeyGateway } from "./mock-provider-key-gateway";
import { MockPersonalAssetsGateway } from "./mock-personal-assets-gateway";
import { MockSkillCatalogueGateway } from "./mock-skill-catalogue-gateway";

export { MockApprovalDecisionGateway } from "./mock-approval-decision-gateway";
export { MockConversationHistoryGateway } from "./mock-conversation-history-gateway";
export { MockConversationProgressGateway } from "./mock-conversation-progress-gateway";
export { MockConversationReplayGateway } from "./mock-conversation-replay-gateway";
export { MockConversationRunGateway } from "./mock-conversation-run-gateway";
export { MockConversationSubmissionGateway } from "./mock-conversation-submission-gateway";
export { MockMcpGateway } from "./mock-mcp-gateway";
export { MockProviderKeyGateway } from "./mock-provider-key-gateway";
export { MockPersonalAssetsGateway } from "./mock-personal-assets-gateway";
export { MockSkillCatalogueGateway } from "./mock-skill-catalogue-gateway";

/**
 * Binds every swappable gateway to its in-memory fixture implementation.
 * For use in tests only — never imported by production app code.
 */
export function provideTestGateways(): Provider[]
{
	return [
		{ provide: GATEWAY_MODE, useValue: "mock" },
		{ provide: CONVERSATION_HISTORY_GATEWAY, useClass: MockConversationHistoryGateway },
		{ provide: CONVERSATION_REPLAY_GATEWAY, useClass: MockConversationReplayGateway },
		{ provide: CONVERSATION_SUBMISSION_GATEWAY, useClass: MockConversationSubmissionGateway },
		{ provide: CONVERSATION_RUN_GATEWAY, useClass: MockConversationRunGateway },
		{ provide: CONVERSATION_PROGRESS_GATEWAY, useClass: MockConversationProgressGateway },
		{ provide: APPROVAL_DECISION_GATEWAY, useClass: MockApprovalDecisionGateway },
		{ provide: MCP_GATEWAY, useClass: MockMcpGateway },
		{ provide: PROVIDER_KEY_GATEWAY, useClass: MockProviderKeyGateway },
		{ provide: PERSONAL_ASSETS_GATEWAY, useClass: MockPersonalAssetsGateway },
		{ provide: SKILL_CATALOGUE_GATEWAY, useClass: MockSkillCatalogueGateway }
	];
}
