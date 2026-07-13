import { Static } from "@sinclair/typebox";

import { AgentInfoSchema, ChatAbortParamsSchema, ChatEventSchema, ChatHistoryParamsSchema, ChatMessageGetParamsSchema, ConnectChallengeSchema, EventFrameSchema, FrameSchema, HealthEventSchema, HelloOkSchema, HistoryMessageSchema, ModelInfoSchema, ReqFrameSchema, ResFrameSchema, SessionOperationEventSchema, SessionToolEventSchema, ShutdownEventSchema } from "./gateway-protocol.schema";

/** A client → gateway request frame. */
export type ReqFrame = Static<typeof ReqFrameSchema>;

/** A gateway → client response frame. */
export type ResFrame = Static<typeof ResFrameSchema>;

/** A gateway → client event frame. */
export type EventFrame = Static<typeof EventFrameSchema>;

/** Any protocol frame. */
export type Frame = Static<typeof FrameSchema>;

/** Payload of a `chat` event — streaming assistant output. */
export type ChatEvent = Static<typeof ChatEventSchema>;

/** Payload of a `session.tool` event — tool-call activity. */
export type SessionToolEvent = Static<typeof SessionToolEventSchema>;

/** Pre-connect challenge pushed before authentication. */
export type ConnectChallenge = Static<typeof ConnectChallengeSchema>;

/** `hello-ok` payload returned when the connect handshake succeeds. */
export type HelloOk = Static<typeof HelloOkSchema>;

/** Params for the `chat.history` bounded recent-window fetch. */
export type ChatHistoryParams = Static<typeof ChatHistoryParamsSchema>;

/** A single display-normalised transcript row from `chat.history`. */
export type HistoryMessage = Static<typeof HistoryMessageSchema>;

/** Params for `chat.abort` — interrupt the running turn. */
export type ChatAbortParams = Static<typeof ChatAbortParamsSchema>;

/** Params for `chat.message.get` — fetch one transcript message by id. */
export type ChatMessageGetParams = Static<typeof ChatMessageGetParamsSchema>;

/** A model catalogue row from `models.list`. */
export type ModelInfo = Static<typeof ModelInfoSchema>;

/** An agent catalogue row from `agents.list`. */
export type AgentInfo = Static<typeof AgentInfoSchema>;

/** Payload of a `session.operation` event — long-running operation status. */
export type SessionOperationEvent = Static<typeof SessionOperationEventSchema>;

/** Payload of a `health` event — pod/session health snapshot. */
export type HealthEvent = Static<typeof HealthEventSchema>;

/** Payload of a `shutdown` event — the pod is going away. */
export type ShutdownEvent = Static<typeof ShutdownEventSchema>;

/** Callbacks an OpenClawConnection consumer can register. */
export interface OpenClawConnectionHandlers
{
	/** Fired with each validated event frame. */
	onEvent?: (frame: EventFrame) => void;

	/** Fired with each validated response frame. */
	onResponse?: (frame: ResFrame) => void;

	/** Fired once the `connect` handshake succeeds (the session is ready). */
	onOpen?: () => void;

	/** Fired when the socket closes (with the close code). */
	onClose?: (code: number) => void;

	/** Fired on socket error or an inbound frame that fails schema validation. */
	onInvalid?: (raw: unknown, reason: string) => void;
}
