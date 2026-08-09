# @opencrane/features/conversation - conversation presentation

> [frontend](../../README.md) > [features](../README.md) > conversation

## What it owns

This frontend feature owns the OpenCrane conversation canvas and renders display-safe conversation
states. The routed view reads canonical replay and owner-visible run status through
`CONVERSATION_PROGRESS_GATEWAY`, presents new and opaque thread-detail routes, read-only context,
files and sharing panels, and an initial composer. The composer is feature-owned and asks the state
submission gateway for availability; it is disabled until the public OpenCrane thread/message
submission contract exists. Reusable message items present user and assistant text, citations, tool
activity, loading, and failure without issuing network requests.

```text
validated adapter view model
            |
            v
 ConversationViewComponent
            |
            v
   MessageItemComponent
            |
            v
 user / assistant / tool / citation / progress UI
```

## Public surface

- `ConversationViewComponent` - the routed canvas, empty state, message stream composition, and unavailable command states.
- `ConversationComposerComponent` - the prompt composer and local keyboard/input validation.
- `ConversationProgressStatusComponent` - feature-local progress and retry status for bounded replay refresh.
- `ConversationSupportPanelComponent` - context, file, and sharing availability views.
- `MessageItemComponent` - one presentation-only conversation message.
- `ConversationMessageView` - the display-safe input contract.
- `ConversationMessageRoles` - user and assistant presentation roles.
- `ConversationMessageStates` - complete, loading, and failed delivery states.

## Boundary

The package owns no HTTP transport, conversation identifiers, authorization, run admission, transcript
persistence, command handling, polling policy, or browser cache. It reads the authenticated display
name from the shared session state and accepts display-safe messages, thread summaries, context, and
file metadata as inputs. Route identifiers are opaque server-issued values and are never displayed as
trusted labels. A state adapter must validate and sanitise canonical data before constructing its
view models, and the progress controller owns cursor reuse/backoff. Commands enter only through
explicit capability ports; until the backend publishes a thread/message submission API, the feature
must show the composer as unavailable rather than constructing a browser-only conversation.

## Dependency direction

Tagged as a frontend conversation library and feature. It may depend on frontend elements, state,
and shared contracts, but never backend or app source. The workspace shell may compose this package;
the conversation package does not import sibling features.

## See also

- Parent feature map: [`libs/frontend/features`](../README.md)
- Conversation render state: [`state/conversation/render`](../../state/conversation/render/README.md)
- Workspace host: [`features/workspace`](../workspace/README.md)
