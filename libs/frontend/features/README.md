# Features — routed UI slices

> [frontend](../README.md) › features

A **feature** is one slice of the app's screen: a routed page or a pane, plus the components that
fill it. Most are **lazy-loaded** — the browser only downloads a feature's code the first time its
route is opened, so the app starts small. Routed features export route contracts that the host or
workspace shell lazy-loads; the shell itself is `workspace`.

## Map

| Package | What it owns |
| --- | --- |
| [`conversation`](./conversation/README.md) | Display-safe conversation messages and visual states. |
| [`context`](./context/README.md) | The right-hand context pane. |
| [`notifications`](./notifications/README.md) | The notification popover. |
| [`tools`](./tools/README.md) | Tools and tool-governance routes. |
| [`welcome`](./welcome/README.md) | First-run onboarding. |
| [`workspace`](./workspace/README.md) | The authenticated workspace shell and child route composition. |

```
                workspace (the shell)
                         │
                  routed tools

   welcome remains a top-level first-run route
```

## Dependency rule for this tier

Features carry `scope:web` and `type:feature`. A feature may import presentational
[`elements`](../elements/README.md) and the [`state`](../state/README.md) layer (gateway ports and
adapters), plus shared contracts. It may **not** import a sibling feature — the one exception is
`workspace`, the shell, which composes the others. Cross-feature sharing goes down into `elements`
or `state`, never sideways. Never import a backend package or an app.

## See also

- Parent index: [`libs/frontend`](../README.md)
- Sibling groups: [`libs/frontend/elements`](../elements/README.md) · [`libs/frontend/state`](../state/README.md)
