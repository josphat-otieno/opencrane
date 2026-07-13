# @opencrane/features/welcome

First-run onboarding for the **operator** app — a guided welcome shown the first
time an authenticated end user / customer admin lands in the workspace.

Distinct from `@weownai/features/onboarding`, the fleet app's self-serve
customer **signup** funnel (fleet-only, stays in the WeOwnAI repo — not
ported here). This flow writes nothing to the control plane.

## Import

```ts
import { WELCOME_ROUTES, WelcomePageComponent, WelcomeOnboardingService } from "@opencrane/features/welcome";
```

## Contents

- `welcome-page` — greets the user, surfaces their resolved workspace, captures
  light local-only personalisation, runs a three-card tour, and hands off to the
  workspace. A PrimeNG Stepper driven by a `WelcomeStep` enum (`@switch`).
- `welcome.util` — pure step machine (`_NextStep`/`_PreviousStep`/…) and the
  first-run flag logic (`_HasCompletedWelcome`, `_WelcomeCompletedValue`).
- `welcome-onboarding.service` — thin `localStorage`-backed gate exposing a
  `completed` signal; degrades gracefully when storage is unavailable.
- `welcome.routes` — `WELCOME_ROUTES`, the funnel mounted at `""`.

## First-run redirect (host wiring)

The lib does not self-mount. The host app:

1. mounts `WELCOME_ROUTES` under a path (e.g. `/welcome`);
2. on the workspace entry, injects `WelcomeOnboardingService` and redirects to
   `/welcome` when `completed()` is `false` (a `CanActivate`/`CanMatch` guard or
   a redirect in the shell);
3. the Finish step calls `markComplete()` and navigates to `"/"`.

## Dependencies

`@opencrane/state/core` (read-only `SessionStore` signals: `displayName`,
`currentTenant`) and PrimeNG. Must not import other feature libs.

## Note

Personalisation is local-only today; wire `personalization` to a `core/api`
preferences service when the backend supports it.
