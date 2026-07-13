# @opencrane/platform

The **web/desktop seam**. Defines an abstract `PlatformBridge` for capabilities
that differ by runtime, so features stay platform-agnostic.

## Import

```ts
import { PLATFORM_BRIDGE, PlatformBridge, provideWebPlatform } from "@opencrane/platform";
```

## Contents

- `platform-bridge.types.ts` — `PlatformBridge` interface (`isDesktop`,
  `bindFolder(projectId)`, …) and `BoundFolder`.
- `platform-bridge.token.ts` — `PLATFORM_BRIDGE` injection token.
- `web-platform-bridge.ts` — `WebPlatformBridge` + `provideWebPlatform()`.
  Desktop-only methods reject as unsupported on the web.

## Usage

Features inject the token and program against the interface:

```ts
private readonly platform = inject(PLATFORM_BRIDGE);
// this.platform.isDesktop, await this.platform.bindFolder(projectId)
```

`apps/web` provides `provideWebPlatform()`. A future `apps/desktop` provides an
Electron/Tauri-backed implementation — **no feature code changes.**

## Dependencies

`@angular/core` only. Depends on no other `@opencrane` lib. This is the **only**
place native/runtime APIs (Electron, Tauri, Node `fs`, `window`) may appear.
