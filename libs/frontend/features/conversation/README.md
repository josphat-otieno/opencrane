# @opencrane/features/conversation - conversation presentation

> [frontend](../../README.md) > [features](../README.md) > conversation

## What it owns

This frontend feature owns the OpenCrane conversation canvas and renders display-safe conversation
states. The routed view presents new and opaque thread-detail routes, read-only context, files and
sharing panels, and an initial composer. Reusable message items present user and assistant text,
citations, tool activity, loading, and failure without issuing network requests.

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
 user / assistant / tool / citation / status UI
```

## Public surface

- `ConversationViewComponent` - the routed canvas, empty state, message stream composition, and unavailable command states.
- `ConversationSupportPanelComponent` - context, file, and sharing availability views.
- `MessageItemComponent` - one presentation-only conversation message.
- `ConversationMessageView` - the display-safe input contract.
- `ConversationMessageRoles` - user and assistant presentation roles.
- `ConversationMessageStates` - complete, loading, and failed delivery states.

## Boundary

The package owns no HTTP transport, conversation identifiers, authorization, run admission,
transcript persistence, command handling, or browser cache. It reads the authenticated display name
from the shared session state and accepts display-safe messages, thread summaries, context, and file
metadata as inputs. Route identifiers are opaque server-issued values and are never displayed as
trusted labels. A feature adapter must validate and sanitise canonical data before constructing its
view models. Future commands enter through explicit capability ports and cannot be inferred from a
rendered control.

## Dependency direction

Tagged as a frontend conversation library and feature. It may depend on frontend elements, state,
and shared contracts, but never backend or app source. The workspace shell may compose this package;
the conversation package does not import sibling features.

## See also

- Parent feature map: [`libs/frontend/features`](../README.md)
- Conversation render state: [`state/conversation/render`](../../state/conversation/render/README.md)
- Workspace host: [`features/workspace`](../workspace/README.md)
