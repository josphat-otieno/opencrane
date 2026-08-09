# @opencrane/state/conversation/adapter - canonical conversation gateways

> [frontend](../../../README.md) > [state](../../README.md) > conversation > adapter

## What it owns

Part of the OpenCrane frontend state layer, between the browser UI and the backend. This package reads
a signed-in participant's already-authorised, display-safe conversation history from public OpenCrane
APIs and exposes narrow ports for future prompt submission and run admission. It does not open an
agent-runtime connection, mint a pod credential, or invent missing thread-message authority: those
concerns belong to the owned execution boundary, not the browser.

Listing history reads `GET /api/v1/me/runs` and derives one newest display row per non-null `threadId`
until a dedicated thread-list contract exists. Reading a thread sends one cookie-session request to
`GET /api/v1/me/conversations/:threadId/events`. The server derives the caller and silo from the
session, applies participant membership, and returns bounded AG-UI server-sent events (SSE). The
reader validates every record with the shared AG-UI state package before reducing it into browser view
state. Run admission calls the generated `POST /api/v1/me/runs` contract with only `threadId` and a
retry-stable `requestIdempotencyKey`. Prompt submission currently fails closed because the generated
public API has no conversation thread/message creation endpoint.

```text
 workspace/conversation features
        |
        v
 Conversation history/replay/submission/run gateways  <-- HERE
        | GET /me/runs
        | GET /me/conversations/:threadId/events
        | POST /me/runs
        v
 conversation/ag-ui validates + reduces safe SSE records
```

Invariant: invalid replay records fail the read rather than being rendered as inferred content. The
cursor is opaque and is returned only by the server, so the browser never invents order or
authorization state.

## Public surface

- `OpenCraneConversationHistoryGateway` - cookie-session reader for recent owner thread summaries.
- `OpenCraneConversationReplayReader` - cookie-session reader for one canonical thread replay.
- `OpenCraneConversationRunGateway` - generated-client port for admitting and reading owner-visible runs.
- `OpenCraneConversationSubmissionGateway` - fail-closed prompt submission port until the public contract exists.
- `CONVERSATION_HISTORY_GATEWAY` / `CONVERSATION_REPLAY_GATEWAY` / `CONVERSATION_SUBMISSION_GATEWAY` / `CONVERSATION_RUN_GATEWAY` - DI tokens consumed by routed features.
- `ConversationHistoryGateway` / `ConversationReplayGateway` / `ConversationSubmissionGateway` / `ConversationRunGateway` - narrow contracts for replaceable API seams.
- `ConversationMessageView` and related display types - read-only view models consumed by feature components.
- `__ReadConversationReplay` - validates and reduces one finite AG-UI SSE body.
- `ConversationReplayReader` - lower-level AG-UI replay contract retained for reducer tests.

## Boundary

Consumed by the workspace and conversation features through DI tokens. It depends on the shared
`ControlPlaneApiService` only for the session-bound generated API client, and delegates all SSE
validation to `conversation/ag-ui`. It deliberately does not cache messages, maintain a socket, expose
runtime commands, or create a thread/message outside a generated public OpenCrane contract.

## Dependency direction

Tagged `scope:web` (`type:state`): it may depend only on other `scope:web` and `scope:shared`
packages, here `conversation/ag-ui`, `@opencrane/core`, `@opencrane/contracts`, and Angular, never
on apps or server domains.

## See also

- Parent index: [state](../../README.md)
- Siblings: [conversation/ag-ui](../ag-ui/README.md) and [conversation/render](../render/README.md)
