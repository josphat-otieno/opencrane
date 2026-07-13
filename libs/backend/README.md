# libs/backend — opencrane-ui backend packages

Every opencrane-ui HTTP surface lives here as an NX package that owns its **routes, core
services, API types, and tests** in one place (#153). The operator app
(`apps/opencrane`) is composition + reconciler wiring only: it mounts the routers
in `src/routes.ts` and injects `PrismaClient` / Kubernetes clients.

## Layout convention

```
libs/backend/<domain>/main/          ← the domain package (@opencrane/backend-<domain>)
  package.json                      ← nx tags: ["scope:backend"]
  src/index.ts                      ← public barrel: routers + everything other packages consume
  src/routes/…                      ← Express routers (+ *.types.ts API contracts)
  src/core/…                        ← the domain's services/logic
  src/__tests__/…                   ← the domain's tests (vitest)
```

The `/main` level is deliberate: a domain directory is a **namespace**, so functional peers
can join it later without restructuring (e.g. `libs/backend/mcp/main` next to
`libs/backend/mcp/infra/obot`).

## Rules (enforced by `npm run lint:boundaries`)

- `scope:backend` packages may depend on other backend packages and `scope:shared` libs
  (`@opencrane/contracts`, `@opencrane/observability`, `@opencrane/infra-*`, `@opencrane/util`)
  — never on an app.
- Shared (`scope:shared`) libs may never depend on a backend package.
- Cross-domain imports go through the target package's **barrel**
  (`@opencrane/backend-<d>`), never deep paths.
- Database models live in the owning domain's schema file —
  see [`docs/agents/prisma.md`](../../docs/agents/prisma.md).

## Adding a domain

1. `libs/backend/<d>/main` with the layout above (copy a small package such as
   `libs/backend/audit/main` as a template); name it `@opencrane/backend-<d>`, tag `scope:backend`.
   - Create `package.json` with `"name": "@opencrane/backend-<d>"`, `"type": "module"`, no dependencies.
   - Create `tsconfig.json` that extends `../../../../tsconfig.json`, sets `compilerOptions.noEmit` to `true`, and includes `src/**/*`.
   - Create `vitest.config.ts` for test configuration (copy from an existing domain package).
2. Add path alias to `tsconfig.json`: `"@opencrane/backend-<d>": ["./libs/backend/<d>/main/src/index.ts"]`.
3. Mount the router in `apps/opencrane/src/routes.ts` and add the
   path alias import in the operator's `src/routes.ts`.
4. Add `prisma/schema/<d>.prisma` if the domain owns models.
5. `npm ci && npm run build && npm run test && npm run lint:boundaries`.

No Dockerfile edits are needed — the operator image copies `libs` wholesale and builds the
app's workspace dependency closure via esbuild (libs are source-only, no dist/ needed in image).
