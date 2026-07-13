# @opencrane/features/notifications

The notification popover anchored to the sidebar bell.

## Import

```ts
import { NotificationPanelComponent } from "@opencrane/features/notifications";
```

## Contents

- `notification-panel` — kind-coloured notification rows (skill, budget,
  contract, run, harvest, policy) with read/unread state and CTAs.

## Dependencies

`core` only (notification model + data). Must not import other feature libs or
`elements/ui`.
