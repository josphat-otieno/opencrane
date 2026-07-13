# @opencrane/features/context

The right pane: Context / Ledger / Canvas tabs.

## Import

```ts
import { ContextPanelComponent } from "@opencrane/features/context";
```

## Contents

- `context-panel` — awareness contract card + scope strip, expandable
  retrieved-scope rail with citations, active skills, ledger trace.
- `components/canvas-doc` — read-only Q3 strategy canvas (metrics, initiative
  table, risks).

## Dependencies

`core` (context models + data) and `elements/ui` (collapsible section, ledger
card, scope chip). Must not import other feature libs.
