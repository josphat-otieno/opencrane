# @opencrane/elements/ui

Reusable, presentational PrimeNG-based components shared across features. Pure
display + orchestration — no data fetching, no domain logic.

## Import

```ts
import { ScopeChipComponent, LedgerCardComponent, CollapsibleSectionComponent } from "@opencrane/elements/ui";
```

## Contents

`scope-chip` · `collapsible-section` · `avatar-circle` · `ledger-card` ·
`section-heading` · `settings-row` · `save-button`.

All standalone, OnPush, signal-based, `input()`/`output()`, templates and styles
in sibling files.

## Dependencies

May depend on `@opencrane/core` (types, colour tokens) only. **Must not** import
any `features/*` lib. New shared element packages live as siblings under
`libs/elements/` (e.g. a future `libs/elements/table`).

## When to add here

If the same markup appears in two or more places, extract it here before writing
it a third time (see AGENTS.md "reusable-component rule").
