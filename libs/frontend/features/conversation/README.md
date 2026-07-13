# @opencrane/features/conversation

The centre pane: thread header, message stream, and composer.

## Import

```ts
import { ConversationViewComponent } from "@opencrane/features/conversation";
```

## Contents

- `conversation-view` — header (dept/model/files/share, sync + scope rail),
  message stream, composer. `messages`/`typing`/`shareOpen` are `linkedSignal`s
  that reset on thread switch.
- `components/message-item` — renders one message: user bubble or assistant card
  stack (text, observation/policy/action ledger, decide, image). Prose parsing
  lives in `message-item.utils.ts`.
- `components/share-panel` — invite-people / share-canvas popover.

## Dependencies

`core` (threads/scope models + data) and `elements/ui` (ledger card). Must not
import other feature libs.
