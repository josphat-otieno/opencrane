# @opencrane/features/settings

The settings view: a section nav plus eight settings sections.

## Import

```ts
import { SettingsPageComponent } from "@opencrane/features/settings";
```

## Contents

- `settings-page` — left nav + active section (`@switch` on a `SettingsSection`
  enum).
- `sections/*` — pod · model-budget · awareness · skills · channels · access ·
  network · account.
- `components/model-chip` — provider-coloured model pill (memoised `computed`s).
- `components/toggle-field` — `p-toggleswitch` wrapper (`linkedSignal` value).

## Dependencies

`core` (settings models + data) and `elements/ui` (section heading, settings
row, save button, scope chip). Must not import other feature libs.

## Note

Section controls (save, promote, toggles) are local-only today; wire to
`core/api` when the backend is connected.
