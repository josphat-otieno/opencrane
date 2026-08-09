import { InjectionToken } from "@angular/core";

import type { ConversationHistoryGateway, ConversationReplayGateway } from "./conversation-gateway.types.js";
import type { ConversationRunGateway } from "./conversation-run.types.js";
import type { ConversationSubmissionGateway } from "./conversation-submission.types.js";

/** DI token for the signed-in user's conversation history reader. */
export const CONVERSATION_HISTORY_GATEWAY = new InjectionToken<ConversationHistoryGateway>("OpenCrane conversation history gateway");

/** DI token for the signed-in user's canonical conversation replay reader. */
export const CONVERSATION_REPLAY_GATEWAY = new InjectionToken<ConversationReplayGateway>("OpenCrane conversation replay gateway");

/** DI token for signed-in prompt submission. */
export const CONVERSATION_SUBMISSION_GATEWAY = new InjectionToken<ConversationSubmissionGateway>("OpenCrane conversation submission gateway");

/** DI token for signed-in run admission and status reads. */
export const CONVERSATION_RUN_GATEWAY = new InjectionToken<ConversationRunGateway>("OpenCrane conversation run gateway");
