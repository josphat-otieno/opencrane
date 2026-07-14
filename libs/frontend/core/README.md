# @opencrane/core

Domain foundation for WeOwnAI: models, demo data, the typed OpenCrane API
client, the PrimeNG theme preset, and pure utilities.

## Import

```ts
import { ScopeLevel, ControlPlaneApiService, WeOwnAiPreset, _ToggleId } from "@opencrane/core";
```

## Contents

- `lib/models/*.types.ts` — DTOs, enums, and colour/label maps (`scope`,
  `session`, `thread`, `context`, `notification`, `settings`).
- `lib/data/*.data.ts` — demo fixtures. **Temporary**; to be replaced by live
  `core/api` calls.
- `lib/api/` — `ControlPlaneApiService` + `FleetManagerApiService` (typed
  `openapi-fetch` clients) and the `CONTROL_PLANE_BASE_URL` / `FLEET_MANAGER_BASE_URL`
  tokens. `ControlPlaneApiService` types against `@opencrane/contracts`'
  `paths` — generated intra-repo from `dist/apps/opencrane/openapi.json`
  via `nx run contracts:generate` (no spec pin: same source of truth as the
  backend). `api/generated/fleet-manager.ts` is still generated from a pinned
  external spec (the Fleet Manager API lives in the WeOwnAI repo) and is
  committed, not gitignored.
- `lib/theme/weownai-preset.ts` — `definePreset(Aura, …)`; terracotta ToggleSwitch.
- `lib/utils/` — framework-agnostic helpers (e.g. `_ToggleId`).

## Dependencies

Depends on **no other `@opencrane` lib** (it is the base). All HTTP must go through
`api/` services — never call `fetch` from features or components.

## Boundary

The Control Plane surface is intra-repo (`@opencrane/contracts`, generated
straight from `dist/apps/opencrane/openapi.json`); the Fleet Manager
surface remains a pinned external OpenAPI spec (that API lives in WeOwnAI).
Either way, never import backend application source directly here — network
contracts (generated types) are the only coupling.
