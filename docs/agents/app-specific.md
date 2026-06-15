# App-Specific Guidance

> Part of the OpenCrane agent guidance. See [`AGENTS.md`](../../AGENTS.md) for the index.

This is the per-package map. The general TypeScript rules ([`typescript.md`](./typescript.md)) and
identity rules ([`architecture.md`](./architecture.md), [`k8s.md`](./k8s.md)) apply to all of them.
Build/test a single package with `pnpm --filter <name> build|test`.

## Apps (`apps/`)

| Path | Package | Responsibility | Key entry / notes |
|------|---------|----------------|-------------------|
| `apps/operator` | `@opencrane/operator` | K8s operator — reconciles Tenant/ClusterTenant/AccessPolicy CRs into namespaces, pods, NetworkPolicies, storage. | `src/index.ts` boots `TenantOperator`, `PolicyOperator`, `IdleChecker`, canary controller. Hosting behaviour is pluggable via `src/hosting/adapters/` (GCP vs on-prem). Reconcile flow: see [`k8s.md`](./k8s.md). |
| `apps/control-plane` | `@opencrane/control-plane` | API-first management surface — source of truth for tenants, grants, MCP servers, skills. | **Express 5** + Prisma + `@kubernetes/client-node`. `src/routes.ts` mounts ~35 routers under `/api/v1`; `src/infra/middleware/auth.middleware.ts` is `___AuthMiddleware`. Dual-writes CRDs + Postgres. |
| `apps/cli` | `@opencrane/cli` | The `oc` CLI — a **thin typed wrapper**, no business logic; proxies to control-plane via the contracts client. | `src/index.ts` registers command groups (`_RegisterTenants`, `_RegisterClusterTenants`, …). Auth via OIDC device flow → cached token; `--output table|json`. |
| `apps/skill-registry` | `@opencrane/skill-registry` | Entitlement-gated skill-bundle delivery plane. | Validates caller projected SA token (`aud=skill-registry`) via TokenReview, proxies to control-plane `/api/internal/bundles/:digest/content`. Non-entitled **and** non-existent → `404` (existence-hiding). |
| `apps/harvesting-agent` | `@opencrane/harvesting-agent` | Background ingestion worker (not API-first). | Slack connector, cursor-based sync → `OrgDocument` rows in Postgres. Standalone HTTP service (`/healthz`, `/metrics`). |
| `apps/tenant` | _(no package.json)_ | Tenant-side assets / templates (not a workspace package). | |

## Libs (`libs/`)

| Path | Package | Responsibility | Notes |
|------|---------|----------------|-------|
| `libs/contracts` | `@opencrane/contracts` | **The keystone** — single source of truth for cross-package types, CRD enums/DTOs, and the generated typed API client. | One barrel (`src/index.ts`); domain `*.types.ts` files; `___CreateControlPlaneClient` + `paths` map emitted from the control-plane OpenAPI spec. Import shared types from here, never redefine per app. |
| `libs/awareness` | `@opencrane/awareness` | In-pod SDK for tenant workloads to query org context (Cognee) directly — no control-plane mediation. | `AwarenessClient` + pluggable transport; results carry guaranteed citations + contract-version stamp for fleet-rollout gating. |
| `libs/onboarding` | _(no package.json)_ | **Empty placeholder** — not in `pnpm-workspace.yaml`, no code yet. | Future tenant-onboarding scaffolding. |

## API-First / CLI-First Rule

Every control-plane capability must be **API-first** and expose a matching `oc` CLI command in
`apps/cli`. No control-plane behaviour should be reachable only through a frontend — a UI is just
another client of the management API, never a privileged path.

## Nested AGENTS.md

Some subdirectories carry their own `AGENTS.md` (e.g. tenant workspace templates under
`apps/operator/src/tenants/deploy/workspace/`). Those are scoped to that directory's generated
artifacts and do not override this guidance for platform source.
