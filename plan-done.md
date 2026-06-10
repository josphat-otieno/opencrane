# OpenCrane — Completed Work

> This file is the historical record of completed phases and decisions.
> Active work lives in `plan.md`.

---

## Executive Summary (History)

**Current state**: Phase 1 baseline is now complete for go-live smoke validation. Core operator/API/UI, Helm deployments, Docker CI publish workflow, and k3d end-to-end reconciliation tests are in place and passing.

**Live update (2026-04-16)**:
- Phase II cost-control routing refactor is complete and validated.
- AI budget/spend/key management is consolidated under `/api/ai-budget`.
- Dedicated AI-budget router tests were added and are passing.
- Control-plane UI test pipeline is now fixed (Karma/Jasmine deps + spec config + baseline spec).
- Full workspace validation currently passes: `pnpm test` and `pnpm build`.

**Live update (2026-04-26)**:
- k3d end-to-end smoke test now passes via `platform/tests/k3d-e2e.sh`.
- Tenant reconciliation was stabilized for local-storage mode:
   - Added per-tenant state PVC creation before Deployment reconciliation.
   - Added operator RBAC permissions for `persistentvolumeclaims`.
   - Handled PVC immutability by skipping replace on `AlreadyExists` conflicts.
- Kubernetes API client usage was corrected:
   - Built-in resources now use typed clients (`CoreV1Api`, `AppsV1Api`, `NetworkingV1Api`).
   - BucketClaim CRD apply path now uses custom-resource client handling.
- Tenant status subresource patching now uses JSON Patch payload shape.
- Invalid default OpenClaw config field (`agents.defaults.thinking`) was removed from generated tenant config.
- Phase 2 execution started:
   - Added in-chart LiteLLM resources (`Deployment`, `Service`, and managed `Secret`) as baseline setup for cost routing.
   - Set chart defaults so cost routing is enabled by default, with production override guidance for master key handling.
   - Added Helm validation guard: non-dev installs fail fast if LiteLLM uses a placeholder/empty master key without `litellm.existingSecret`.

**Live update (2026-05-14)**:
- Removed duplicate LiteLLM rendering from the Helm chart so the root chart templates are the only deployment path.
- Added a full local k3d bootstrap path with PostgreSQL, control-plane, LiteLLM, and Prisma migrations.
- Added a `strict` local profile to exercise prod-style Helm validation and explicit LiteLLM secret wiring locally.
- Captured a parity checklist clarifying that local validates core stack wiring, while GCP remains the only path that exercises cloud identity, GCS, External Secrets, GCE ingress, and DNS. (Crossplane is superseded by the GoF Adapter hosting architecture — see `docs/hosting-architecture.md`.)
- Implemented deterministic tenant `policyRef` precedence in the operator: explicit `policyRef` wins, then single selector match, then configured default, with conflict and missing-policy error states written to Tenant status.
- Added detect-only drift reporting for Tenant and AccessPolicy CRDs versus PostgreSQL projection rows in the control-plane as the first P0 dual-write visibility slice.
- Published resolved AccessPolicy MCP allow/deny data into the tenant managed-runtime contract so runtime enforcement can consume concrete policy inputs instead of only a policy name.
- Enforced the managed-runtime MCP policy in the tenant entrypoint for shared skills, so a denied `skills` server now prevents org/team skill linking at startup.
- Implemented projection repair for Tenant and AccessPolicy rows: `POST /tenants/repair` and `POST /policies/repair` read CRDs as source of truth and upsert drifted PostgreSQL rows; dry-run by default, apply on `?dryRun=false`.
- Added `GET /api/metrics/projection-drift` so dashboards can poll detect-only Tenant and AccessPolicy mismatch counts from the existing drift detector.
- Added configurable threshold evaluation to `GET /api/metrics/projection-drift` so the API now exposes basic drift alert state alongside mismatch counts.
- Added projection lag metrics to `GET /api/metrics/projection-drift`, derived from drifted row `updatedAt` timestamps so dashboards can estimate how stale current mismatches are.

**Live update (2026-05-25)**:
- Memory architecture direction is now set: OpenClaw remains the source-system integration layer and writes through to Cognee for tenant-scoped memory orchestration.
- The earlier "uncertain strict tenancy fit" concern is retired for Cognee. Tenancy and RBAC are treated as supported via Cognee's dataset-level EBAC model.
- Memory adoption gate is now explicit: dataset granularity choice, AccessPolicy-to-Cognee permission mapping, source-permission propagation, and freshness invalidation strategy are mandatory before production cutover. Self-hosted audit parity is tracked as an operational hardening item.
- `docs/memory.md` is now the canonical target-state design for the memory layer.

**Live update (2026-06-10) — re-verified against working tree**:
- **Phase 5 is code-complete.** `terraform/modules/crossplane/` and `crossplane-provider.yaml` are deleted; `GcpHostingAdapter` + `GcpBucketClient` provision GCS buckets in-operator via `@google-cloud/storage` + Workload Identity; Terraform is split into `terraform/core/` + `terraform/cloud/gcp/`; `values.yaml` defaults to `hosting.provider: onprem`. Remaining: deploy-validation evidence (P5.2 on-prem, P5.3 GCP). Stale Crossplane comment + RBAC rule removed (P5.1 done).
- **Phase 4 Track A built & wired.** `apps/skill-registry/` (projected-token validation, get-by-digest-only, existence-hiding 404s, entitlement-checked); Obot gateway deploy + `/api/internal/obot-registry`; `/api/internal/bundles` content delivery; real grant compiler + `GET /tenants/:name/effective-contract`.
- **Phase 4 Track A residual gaps:** ingest scanning (P4A.1), runtime-plane drift repair (P4A.2), tenant-side re-pull loop (P4A.3).
- **Phase 4 Track B not started.** Awareness SDK, contract versioning/canary, golden-query harness, fleet skills-sharing protocol, awareness SLOs all absent.
- **Process:** Track-A + Phase-5 work committed on branch `phase-4-5-fixes`.

**Live update (2026-06-09) — _(partially superseded by 2026-06-10 above)_**:
- Phase 5 shipped (headless API + CLI). `oc` CLI, OpenAPI, generated `libs/contracts` client, and removal of `apps/control-plane-ui` in place.
- Phase 4 was paused mid-flight: org-index schema v2, Slack lineage/freshness, projected-token migration, and the control-plane MCP/Skills/third-party management layer built. Runtime enforcement planes and fleet-awareness track not built at that point.

---

## README Realization Track (2026-05-12)

### Vision-to-Execution Mapping

| README promise | Delivery status | Delivery phase |
|----------------|-----------------|----------------|
| Every employee gets an isolated assistant | Baseline in place | Phase 1 complete + hardening backlog |
| Cost governance and budget controls | Complete | Phase 2 |
| Retrieval plugin with RBAC-filtered org context | Foundation complete | Phase 2-3 |
| Company-wide harvesting agents + org index | Complete | Phase 2-3 |
| Self-service provisioning (web portal) | Complete (API + CLI) | Phase 3 / Phase 5 |
| Memory orchestration cutover (Cognee write-through) | Complete | Phase 3 |

### Steering Rule For Docs And Pitch

Use three labels consistently across README/pitch/sales material:
- **Available now**: only Phase 1–3 + Phase 5 validated and currently passing capabilities.
- **In progress**: Phase 4 deliverables under active implementation.
- **Planned**: Phase 4 Track B items not yet validated.

---

## Phase 1: Core Platform (Complete)

### Architecture Decisions (Locked)

1. **Helm Chart Structure** — Root chart owns LiteLLM directly; no separate LiteLLM subchart. PostgreSQL consumed via `DATABASE_URL` Secret wiring.
2. **Operator Deployment** — Single-replica baseline. RBAC and env wiring for storage provider, ingress, LiteLLM, and idle reconciliation are part of the shipped chart baseline.
3. **Tenant Pod Isolation** — On-prem path uses PVC fallback; GCP path uses GCS/Workload Identity via in-operator GcpHostingAdapter (Crossplane retired).
4. **Control Plane Deployment** — PostgreSQL-backed deployment flows; local provisions in-cluster database for full-stack bring-up.
5. **Terraform & IaC** — `terraform/core/` (cloud-agnostic) + `terraform/cloud/gcp/` (GCP-specific). Crossplane module retired.

### Completion Checklist

| Item | Status | Evidence |
|------|--------|----------|
| **Helm templates** (operator/control-plane + RBAC/services) | ✅ Complete | Deploys successfully in k3d via chart install |
| **Docker image CI publish workflow** | ✅ Complete | `.github/workflows/docker.yml` builds/tests/e2e and publishes on `main` |
| **Prisma migrations present** | ✅ Complete | `apps/control-plane/prisma/migrations/0001_init` committed |
| **Tenant runtime image + entrypoint** | ✅ Complete | `apps/tenant/deploy/Dockerfile` + `entrypoint.sh` exercised in k3d e2e |
| **k3d end-to-end smoke test** | ✅ Complete | `platform/tests/k3d-e2e.sh` passes and validates tenant reconcile |

### Success Criteria

- [x] Operator reconciles a Tenant CR end-to-end (ServiceAccount → Deployment → Ingress → status).
- [x] AccessPolicy CRD generation path is implemented and covered by tests.
- [x] `helm install opencrane platform/helm/` deploys operator + CRDs.
- [x] Tenant pod starts, mounts storage, links skills, starts OpenClaw gateway on port 18789.

### Local vs GCP Parity Checklist (2026-05-14)

| Capability | Local `default` | Local `strict` | GCP deploy |
|------------|-----------------|-------------------|------------|
| Operator + control-plane + LiteLLM + PostgreSQL | ✅ | ✅ | ✅ |
| Prisma migration job | ✅ | ✅ | ✅ |
| Production-style LiteLLM validation rules | ❌ | ✅ | ✅ |
| Explicit `opencrane-litellm` Secret control flow | ❌ | ✅ | ✅ |
| In-cluster database secret (`opencrane-db`) | ✅ | ✅ | ✅ |
| Tenant PVC fallback flow | ✅ | ✅ | ❌ |
| Workload Identity annotation path | ❌ | ❌ | ✅ |
| External Secrets / Secret Manager path | ❌ | ❌ | ✅ |
| GCE ingress + static IP + DNS wiring | ❌ | ❌ | ✅ |

---

## Phase 2: Cost Control + Retrieval Foundation (Complete)

### Architecture Decisions (Locked 2026-05-28)

1. **LiteLLM Deployment** — Same namespace (`opencrane`); shared platform PostgreSQL; chart-managed master key and database URL.
2. **Virtual Key Generation** — Sync during Tenant reconcile (step 4); static per tenant; revocation manual.
3. **Spend Tracking** — Per tenant (primary) + per model (secondary); real-time from LiteLLM API; hard enforcement via LiteLLM 429; 80% warning via spend endpoint.
4. **Tenant Config Injection** — `LITELLM_ENDPOINT` env var + `LITELLM_API_KEY` from tenant Secret; tenants cannot override cluster-local proxy endpoint.
5. **Observability & Alerts** — 503 when LiteLLM unreachable; `budgetAlertState: "warning"` at 80%.
6. **Org Knowledge Index** — Minimum schema with `source`, `sourceId`, `owner`, `teamScope`, `sensitivityTags`, `title`, `content`, `contentHash`, `embeddingReady`, `ingestedAt`, `updatedAt`. PostgreSQL-only for Phase 2. Target Phase 3+: Cognee orchestration.
7. **Retrieval Authorization** — AccessPolicy sole enforcement source; 403 on denied (not silent empty); direct OpenClaw/Clawdbot to Cognee (no control-plane proxy).
8. **Harvesting Agent** — Slack connector with cursor-based batch pull (15-minute interval); ingestion SLOs: lag < 30 min p95, failure rate < 1%.
9. **Single-Writer Ownership** — Operator sidecar owns PostgreSQL projection writes; request-path dual-writes retired in Phase 3.

### Success Criteria (All Met)

- [x] Helm chart deploys LiteLLM through the root chart with shared PostgreSQL integration.
- [x] On Tenant CR creation, operator creates a LiteLLM virtual key with monthly budget.
- [x] Tenant pod receives `LITELLM_API_KEY` and proxy endpoint.
- [x] Control Plane exposes spend endpoint; shows per-tenant usage + budget.
- [x] Retrieval path direct from OpenClaw/Clawdbot to Cognee.
- [x] One harvesting connector continuously ingests documents with measurable lag/error metrics.
- [x] AccessPolicy outcomes translated into Cognee dataset memberships via `/api/tenants/:name/datasets`.
- [x] MCP server allow/deny enforced at gateway level beyond startup.
- [x] Tenant skill distribution model: durable `skillAllowlist` field on Tenant CRD.
- [x] Projection drift measurable via metrics; repairable via `POST /tenants/repair` and `POST /policies/repair`.
- [x] External alert delivery: webhook fired when drift count exceeds threshold.

---

## Phase 3: Self-Service Provisioning + Memory Cutover (Complete)

### Architecture Decisions (Locked)

1. **Web Portal** — Embedded in Angular control-plane-ui (removed in Phase 5; admin surface now API + `oc` CLI only).
2. **Auth Baseline** — Bearer token for Phase 3; OIDC deferred to future work. Phase 5 delivered OIDC device flow.
3. **Tenant Provisioning** — Self-provisioning creates Tenant CRs directly; naming/team constraints policy-driven.
4. **Memory Cutover** — Hard switch to Cognee write-through for all tenants; OpenClaw responsible for source connectors and permission-aware copy semantics.
5. **Dataset Granularity** — org/team/project/personal; AccessPolicy as sole enforcement source; deny-by-default.

#### Phase 3 Decision Lock: AccessPolicy → Cognee Mapping

- AccessPolicy remains the sole authorization source for retrieval decisions.
- Dataset scopes are enforced as org/team/project/personal, with deny-by-default behavior.
- Explicit deny always overrides allow on scope conflicts.
- Retrieval path grants read access only to datasets explicitly allowed by effective policy.
- Write/share/delete permissions are disabled by default and require explicit policy authorization.
- Every retrieval authorization outcome must be audit-logged with principal, dataset scope, action, decision, and policy reason.

### Success Criteria (All Met)

- [x] Non-admin user can self-provision tenant via web form (ProvisionPageComponent + TenantApiService).
- [x] Tenant appears in Kubernetes as Tenant CR within 30s.
- [x] Dashboard shows health, spend, and last reconciled time per tenant.
- [x] Retrieval runtime cut over to Cognee write-through for all tenants.
- [x] AccessPolicy-compatible dataset permissions enforced through control-plane-managed Cognee subject memberships.
- [x] Dataset membership controls exposed for org/team/project/personal scopes.
- [x] Approval flow explicitly deferred; no Phase 3 blocker depends on approval route delivery.
- [x] Freshness/invalidation deferred to Sprint 3+ under Clawdbot control.

---

## Phase 5: Headless Control Plane (Code-Complete)

### Architecture Decisions (Locked)

1. **API as the single boundary** — Every capability reachable through `/api/v1`. OpenAPI emitted from build; CI drift gate enforced.
2. **CLI as a first-class surface** — `oc` CLI covers full administrative surface; authenticates via OIDC device flow (`oc auth login`); no static bearer token required by default.
3. **UI decoupled** — `apps/control-plane-ui` removed from this repo. Helm chart and installers no longer reference it. Platform operable via API + CLI only.
4. **Hosting adapter migration** — GoF Adapter pattern; `OnPremHostingAdapter` is default; `GcpHostingAdapter` provisions GCS buckets via `@google-cloud/storage` + Workload Identity (no Crossplane). Terraform split into `terraform/core/` + `terraform/cloud/gcp/`.

### Steps (All Complete)

**Step 1 — Hosting adapter migration** ✅
- `HostingAdapter` interface + `OnPremHostingAdapter` + `GcpHostingAdapter` in `apps/operator/src/hosting/`.
- Crossplane `BucketClaim` path deleted; `modules/crossplane/` and `crossplane-provider.yaml` removed.
- Terraform split: `terraform/core/` + `terraform/cloud/gcp/`; Crossplane module retired.
- `platform/helm/values/gcp.yaml` override added; `values.yaml` defaults to `hosting.provider: onprem`.

**Step 2 — API surface hardening + OpenAPI** ✅
- All business routes at `/api/v1/`. Consistent `{ error, code }` error envelopes. Cursor-based keyset pagination on audit.
- `openapi.json` emitted from `pnpm build`; `GET /api/v1/openapi.json` serves spec at runtime.
- CI drift gate: `pnpm emit-openapi && git diff --exit-code openapi.json`.

**Step 3 — Contract / SDK package + `oc` CLI** ✅
- `openapi-typescript` generates typed `paths` from `openapi.json` into `libs/contracts/src/generated/api.ts`.
- `createControlPlaneClient(baseUrl, token?)` factory in `libs/contracts/src/client.ts`.
- `apps/cli` (`oc` binary): command groups `tenants`, `policies`, `mcp`, `skills`, `budget`, `audit`, `tokens`, `providers`.

**Step 4 — Capability parity audit + auth alignment** ✅
- All UI-used endpoints documented in OpenAPI spec.
- `oc metrics server`, `oc metrics drift`, `oc auth me`, `oc auth logout` added.
- OIDC device flow (`POST /auth/device` → browser activation → poll `/auth/device/token` → credentials saved to `~/.config/opencrane/credentials.json`). Break-glass `--token` flag removed from CLI.

**Step 5 — UI extraction + chart cleanup** ✅
- `apps/control-plane-ui` removed from `pnpm-workspace.yaml` and deleted from repo.
- `docs/api.md`, `docs/cli.md`, `docs/integration-guide.md` published.

### Success Criteria

- [x] Platform fully operable with no admin UI (API + CLI only).
- [x] Every administrative capability has a documented API endpoint and `oc` CLI command.
- [x] OpenAPI emitted from build; CI drift gate enforced.
- [x] `libs/contracts` publishes a generated, versioned client consumed by the CLI.
- [x] `oc` CLI authenticates via OIDC device flow; no command requires a static bearer token by default.
- [x] `apps/control-plane-ui` removed; Helm chart/installers no longer reference it.
- [x] External repository can integrate as git submodule and drive every operation through the published contract.
- [x] GCP adapter provisions per-tenant GCS buckets directly in operator; no Crossplane dependency.
- [x] `terraform/core/` applies to any cluster; `terraform/cloud/gcp/` is the only GCP-specific path.
- [~] Clean Kubernetes cluster deploys with zero cloud env vars — code path in place; deploy-validation evidence pending (P5.2 in active plan).

---

## Implementation Status Update (2026-05-28)

All major Phase 2 items are now implemented. The following sessions were completed in this cycle:

### Session 1 — Phase 2 architecture decisions locked
All open Phase 2 decisions resolved with concrete outcomes.

### Session 2 — LiteLLM governance
Already complete from previous cycle. Key generation, budget enforcement, spend endpoint, and tenant injection validated.

### Session 3 — Retrieval foundation
- `OrgDocument` and `HarvestingCursor` models added to Prisma schema (migration `0002_retrieval_foundation`).
- Retrieval now goes directly from OpenClaw/Clawdbot to Cognee; control-plane retains dataset membership and Cognee permission synchronization.

### Session 4 — Harvesting-agent MVP
- `apps/harvesting-agent` workspace package with Slack source connector.
- Cursor-based incremental sync; normalizes to `NormalizedDocument` and upserts to `org_documents`.
- `/metrics` and `/healthz` HTTP endpoints.

### Session 5 — MCP + tenant skill governance
- `skillAllowlist` field added to Tenant CRD and `TenantSpec`.
- `mcpPolicy` field added for per-tenant invocation-level MCP enforcement.
- Operator injects `OPENCRANE_TENANT_MCP_ALLOW` and `OPENCRANE_TENANT_MCP_DENY` env vars.
- `entrypoint.sh` updated: tenant CRD deny wins over policy-level allow.

### Session 6 — Projection drift alerting + ownership
- Webhook delivery added to `GET /api/metrics/projection-drift`.
- Single-writer ownership: operator sidecar is the authoritative projector.

### Session 7 — runbook.md
- `docs/runbook.md` written with install, verification, upgrade, rollback, and incident-response procedures.

### Session 8 — Angular portal features
- `TenantApiService` and `SpendApiService` in `core/api/`.
- Shared components: `TenantCardComponent`, `SpendChartComponent`.
- Feature pages: `DashboardPageComponent`, `ProvisionPageComponent`, `TenantDetailPageComponent`, `AdminPanelPageComponent`.

### Session 9 — Operational maturity foundation
- `TenantUpdateWithCanaryStrategyController` with npm release polling and canary rollout strategy.
- Prometheus-format `/prom/metrics` endpoint with tenant phase gauges, org document count, audit entry counter.

### Session 10 — Dataset membership controls + retrieval authorization
- Tenant dataset membership APIs: `GET` + `PUT /api/tenants/:name/datasets`.
- Retrieval route enforces dataset scope membership with explicit `DATASET_DENIED` responses.
- Conformance tests for dataset allow/deny paths.

---

## Phase-by-Phase Decisions (Phases 1–3, All Closed)

### Phase 1 Decisions (Closed)
- [x] Helm chart owns LiteLLM directly; no separate subchart.
- [x] Operator baseline is single-replica.
- [x] Tenant isolation: GCS/hosting-adapter + PVC fallback.
- [x] Local full-stack install supports PostgreSQL-backed bring-up.

### Phase 2 Decisions (Locked 2026-05-28)
- [x] LiteLLM namespace: same namespace as operator.
- [x] Virtual key generation: sync (block reconcile), implemented in operator reconcile step 4.
- [x] Spend tracking: real-time from LiteLLM API, augmented with local budget metadata.
- [x] Hard budget enforcement: LiteLLM rejects on overage (429); control-plane warns at 80%.
- [x] Proxy optional: no — LiteLLM is cluster-wide; opt-out is not allowed.
- [x] Org index storage profile: PostgreSQL-only for MVP; pgvector deferred to Phase 3+.
- [x] Retrieval authorization source: AccessPolicy only.
- [x] Retrieval failure behavior: explicit 403 authorization errors (not silent empty results).
- [x] First harvesting connector: Slack with cursor-based batch pull (15-minute interval).
- [x] Ingestion SLO thresholds: lag < 30 minutes p95, failure rate < 1% per sync cycle.
- [x] Single-writer ownership: operator sidecar owns PostgreSQL projection writes.

### Phase 3 Decisions (Locked)
- [x] Portal: embedded in Angular control-plane-ui (removed in Phase 5; admin now API + CLI only).
- [x] Auth baseline: bearer token for Phase 3; OIDC delivered in Phase 5.
- [x] Approval workflow deferred to future work.
- [x] Memory upgrade in Phase 3 required scope.
- [x] Memory cutover wave: all tenants; mode: hard switch.
- [x] Dataset granularity: org, team, project, personal.
- [x] Tenant CR SLO target: 30 seconds.
- [x] Freshness/invalidation: deferred to Sprint 3+ under Clawdbot control.

---

## Go-Live Checklist (Full)

| Item | Owner | Status | Done Criteria |
|------|-------|--------|---------------|
| Local baseline green (`pnpm install`, `pnpm test`, `pnpm build`) | Backend | ✅ Complete (2026-04-16) | Commands pass locally. |
| Local platform e2e (`platform/tests/k3d-e2e.sh`) | Backend + QA | ✅ Complete (2026-04-26) | Helm install succeeds; tenant reconcile smoke test passes in k3d. |
| Local full-stack bootstrap (`platform/tests/k3d-local.sh`) | Backend + DevOps | ✅ Complete (2026-05-14) | Local path provisions PostgreSQL, control-plane, LiteLLM, migrations. |
| Helm chart completion (`platform/helm/templates`) | DevOps | ✅ Complete for Phase 1 baseline | Operator and control-plane deploy cleanly. |
| GCP installer smoke (`./platform/install.sh gcp`) | DevOps | Not yet revalidated | Fresh GCP project deploys end-to-end; test tenant reconciles successfully. |
| Docker image publish automation | DevOps | ✅ Complete | CI builds/tests/e2e and publishes images on `main`. |
| Prisma migration rollout (`prisma migrate deploy`) | Backend | ✅ Complete baseline | Migrations committed; installer paths include migration execution. |
| CI e2e gate | QA + DevOps | ✅ Complete baseline | CI runs the k3d smoke path. |
| DNS + ingress verification | DevOps | Not started | Domain and TLS resolve correctly; subdomains accessible externally. |
| Runbook + rollback docs | Backend + DevOps | ✅ Complete (2026-05-28) | `docs/runbook.md` covers install, verify, upgrade, rollback, incident response. |

---

## Effort Summary

| Phase | Effort | Timeline | Start |
|-------|--------|----------|-------|
| **Phase 1** (Core) | 90h | 3 weeks | Week 1 |
| **Phase 2** (Cost control + retrieval foundation) | 127h | 2-3 weeks | Week 2 |
| **Phase 3** (Self-service + memory cutover) | 97h | 3 weeks | Week 4 |
| **Phase 4** (Fleet organizational awareness + MCP & skills platform) | 324h | 8-10 weeks | Week 7 |
| **Phase 5** (Headless API + CLI) | 164h | 4-5 weeks | After Phase 3 |
| **Total** | **802h** | **20–25 weeks** | |
