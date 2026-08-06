# @opencrane/features/workspace — authenticated application shell

> [frontend](../../README.md) › [features](../README.md) › workspace

## What it owns

The authenticated workspace shell for `opencrane-ui`: persistent navigation, signed-in user
identity presentation, logout, and a child router outlet. The conversation feature is mounted at
the root and `/conversation/:threadId`; the existing tools feature is mounted at `/tools`. The shell
also owns read-only history navigation because it persists while child features are lazy-loaded.

The shell deliberately owns no conversation transport or product authority. Conversation
capabilities must enter through the authenticated OpenCrane API and a dedicated frontend state
adapter.

```
 opencrane-ui authenticated root
              │
              ▼
       WORKSPACE_ROUTES  ◄── HERE
              │
       ┌──────┴────────┐
       ▼               ▼
 conversation view   tools routes
```

**In this flow:** [`opencrane-ui`](../../../../apps/opencrane-ui/README.md) -
[`features/conversation`](../conversation/README.md) - [`features/tools`](../tools/README.md) -
[`state/core`](../../state/core/README.md)

## Public surface

- `WORKSPACE_ROUTES` - lazy-loaded route contract mounted by `opencrane-ui` at `/`.
- `WorkspaceConversationHistoryEntryView` - display-safe thread summary accepted by shell navigation.

## Boundary

This is the one feature package allowed to compose sibling routed features. It may use frontend
state and presentation packages, but it cannot import backend code, app source, or retired browser
transports. Child features own their own display and API orchestration.

## Dependency direction

Tagged `scope:web` and `type:feature`. It may depend only on `scope:web` or `scope:shared` frontend
packages. Its current edges are `@opencrane/state/core` for signed-in shell state,
`@opencrane/features/conversation` for the root canvas, and `@opencrane/features/tools` for lazy
child-route composition. It never imports app or backend source.

## See also

- Parent feature map: [`libs/frontend/features`](../README.md)
- Host application: [`apps/opencrane-ui`](../../../../apps/opencrane-ui/README.md)
- First-run state: [`libs/frontend/state/onboarding`](../../state/onboarding/README.md)
