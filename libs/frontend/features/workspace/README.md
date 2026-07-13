# @opencrane/features/workspace

The application shell — the route-level container that composes every other
feature into the three-pane console.

## Import

```ts
import { WorkspacePageComponent } from "@opencrane/features/workspace";
```

## Contents

- `workspace-page.component` — shell: sidebar rail + session/settings view
  switch + notification popover. Owns the `activeThread`, `view`, and
  `contextOpen` signals.
- `components/sidebar` — dark navigation rail (sessions, automation runs, footer).
- `components/session-row` — a single session entry (shared by both rail lists).
- `workspace.types.ts` — `WorkspaceView` enum.

## Dependencies

The **only** feature lib allowed to import sibling features. Depends on `core`,
`elements/ui`, and `features/{conversation,context,notifications,settings}`.
Keep this lib thin: it orchestrates; display lives in the libs it composes.
