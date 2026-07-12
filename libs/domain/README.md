# libs/domain — control-plane domain packages

Every control-plane HTTP surface lives here as an NX package that owns its **routes, core
services, API types, and tests** in one place (#153). The operator app
(`apps/clustertenant-operator`) is composition + reconciler wiring only: it mounts the routers
in `src/routes.ts` and injects `PrismaClient` / Kubernetes clients.

## Layout convention

```
libs/domain/<domain>/main/          ← the domain package (@opencrane/domain-<domain>)
  package.json                      ← nx tags: ["scope:domain"]
  src/index.ts                      ← public barrel: routers + everything other packages consume
  src/routes/…                      ← Express routers (+ *.types.ts API contracts)
  src/core/…                        ← the domain's services/logic
  src/__tests__/…                   ← the domain's tests (vitest)
```

The `/main` level is deliberate: a domain directory is a **namespace**, so functional peers
can join it later without restructuring (e.g. `libs/domain/mcp/main` next to
`libs/domain/mcp/infra/obot`).

## Rules (enforced by `npm run lint:boundaries`)

- `scope:domain` packages may depend on other domain packages and `scope:shared` libs
  (`@opencrane/contracts`, `@opencrane/observability`, `@opencrane/infra-*`, `@opencrane/util`)
  — never on an app.
- Shared (`scope:shared`) libs may never depend on a domain package.
- Cross-domain imports go through the target package's **barrel**
  (`@opencrane/domain-<d>`), never deep paths.
- Database models live in the owning domain's schema file —
  see [`docs/agents/prisma.md`](../../docs/agents/prisma.md).

## Adding a domain

1. `libs/domain/<d>/main` with the layout above (copy a small package such as
   `libs/domain/audit/main` as a template); name it `@opencrane/domain-<d>`, tag `scope:domain`.
   - Create `package.json` with `"name": "@opencrane/domain-<d>"`, `"type": "module"`, no dependencies.
   - Create `tsconfig.json` that extends `../../tsconfig.base.json` and sets `compilerOptions.baseUrl` to the package root.
   - Create `vitest.config.ts` for test configuration (copy from an existing domain package).
2. Add path alias to `tsconfig.base.json`: `"@opencrane/domain-<d>": ["libs/domain/<d>/main/src"]`.
3. Mount the router in `apps/clustertenant-operator/src/routes.ts` and add the
   path alias import in the operator's `src/routes.ts`.
4. Add `prisma/schema/<d>.prisma` if the domain owns models.
5. `npm ci && npm run build && npm run test && npm run lint:boundaries`.

No Dockerfile edits are needed — the operator image copies `libs` wholesale and builds the
app's workspace dependency closure via esbuild (libs are source-only, no dist/ needed in image).
