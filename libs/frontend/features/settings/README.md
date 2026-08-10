# @opencrane/features/settings - Settings feature

> [frontend](../README.md) › features › settings

## What it owns

This package owns the routed Settings area inside `opencrane-ui`. It gives a signed-in person a personal Account section and gives workspace administrators a Models section backed by the provider-key gateway.

```
 workspace shell
      │ /settings
      ▼
 ┌────────────────────────────┐
 │ features/settings ◄── HERE │
 └────────────────────────────┘
      │
      ├─ personal/account  reads SessionStore
      └─ workspace/models  uses provider-key gateway
```

In this flow: [workspace](../workspace/README.md), [state/core](../../state/core/README.md), and [state/provider-key/adapter](../../state/provider-key/adapter/README.md).

Unsupported settings leaves deliberately render placeholders. They are visible as future destinations but do not expose controls until public OpenCrane API contracts exist.

## Public surface

- `SETTINGS_ROUTES` - child routes mounted by the workspace shell at `/settings`.
- `SettingsPageComponent` - persistent Settings shell with Workspace and Personal navigation.
- `WORKSPACE_SETTINGS_NAVIGATION` and `PERSONAL_SETTINGS_NAVIGATION` - stable navigation entries for the sidebar.
- `SettingsScope`, `SettingsSectionId`, and `SettingsNavigationItem` - route and navigation vocabulary for tests and consumers.

## Boundary

Feature components consume narrow state ports such as `SessionStore` and `PROVIDER_KEY_GATEWAY`. They must not call API clients directly, import backend code, or revive Pod/OpenClaw fixture settings as user-facing controls.

## Dependency direction

The package is tagged `scope:web` and `type:feature`. It may depend on frontend core, frontend elements, and frontend state packages, but it must not depend on another feature package or an app source tree.

## See also

- [features index](../README.md)
- [workspace feature](../workspace/README.md)
- [provider-key adapter](../../state/provider-key/adapter/README.md)
