# ADR 0002 — Per-ClusterTenant silo architecture (operator, planes, API/DB) by isolation tier

- **Status:** Proposed
- **Date:** 2026-06-26
- **Task:** `task_5164276f` (Phase 3 / S6 of the strict-multi-tenancy program)
- **Supersedes / superseded by:** none — **refines** [ADR 0001](0001-cluster-tenant-virtual-network-isolation.md), which chose the isolation *substrate* (Linkerd + the NetworkPolicy floor) and explicitly deferred the *placement* decisions (which planes move into the silo, the per-CT operator design, per-CT API/DB) to Phase 3 / this ADR.
- **Related:** [`silo-multi-tenant-plan.md`](../../silo-multi-tenant-plan.md) (§ Phase 3) · [`plan.md`](../../plan.md) (S6) · `platform/helm/values.yaml` (`multiInstance`, `sharedPlatform`)

## Context

ADR 0001 settled the *boundary*: each ClusterTenant is a strictly isolated silo, with a
per-silo default-deny `NetworkPolicy` floor (S2) and Linkerd mTLS identity + L7 authorization
(S5) layered on top, and the super-admin control-plane as the only cross-silo principal.

But the *brains* are still communal. As-built, `opencrane-system` runs **shared singletons**
that serve every tenant:

| Concern | As-built | Problem it creates |
|---|---|---|
| Operator | one operator reconciles all tenants | a single failure domain; one operator writes every org's ingress |
| Planes (Obot/MCP, skill-registry, LiteLLM, Cognee, tenant DB) | shared singletons | data/credentials co-resident; isolation rests entirely on app-level ACLs |
| Control-plane API + DB | one shared API + DB | the **resolution-ambiguity class**: the shared plane must constantly infer *which tenant* a request/row/resource belongs to — the root of a recurring family of bugs (default-tenant projection, cross-tenant lookups, the resolver patches), shimmed today by PR #68 |

This ADR decides **what runs per-ClusterTenant and where it is scheduled by
`ClusterTenant.spec.isolationTier`**. The plane *topology* is uniform — every tenant gets its
own dedicated plane instances (decision 1) — so the tier is not about *whether* planes are
dedicated but about the *underlying compute* they land on (shared nodes → dedicated nodes →
separate cluster). The decision must reuse the machinery the chart already has and preserve
per-org ingress, and it pushes the cost question to **bin-packing density** (S7), not to
multiplexing tenants inside one plane.

Two pieces of existing machinery are load-bearing here:

- **`multiInstance`** — the chart can already run N strictly-isolated OpenCrane instances in
  one cluster, each with a namespace-scoped operator (`requireWatchNamespace`).
- **`sharedPlatform.<plane>.mode = instance | shared`** — each plane (LiteLLM, skill-registry,
  Obot) is *already* switchable between a release-local instance and a referenced shared
  endpoint.

S6 is largely **applying these per-ClusterTenant**, not inventing a new mechanism.

## Decision

### 1. Every ClusterTenant gets DEDICATED per-CT plane instances at every tier; tiers differ only by the underlying infra

The plane topology is **uniform across tiers**: each ClusterTenant runs its **own dedicated
instances** of every data/runtime plane — **Obot/MCP, skill-registry, Cognee, LiteLLM**, its
own **operator**, its own **per-CT networking** (the S2 NetworkPolicy silo + S5 Linkerd
identity), and its own **tenant DB**. Planes are **never shared singletons multiplexing
tenants behind an ACL** — even on the `shared` tier. What varies by `isolationTier` is **only
the underlying infrastructure those per-CT instances are scheduled onto**:

| `isolationTier` | Plane instances (Obot/skills/Cognee/LiteLLM/operator/DB/networking) | Underlying infra |
|---|---|---|
| `shared` | **dedicated per-CT instances** (one stack per tenant) | **shared node pool** (per-CT stacks bin-packed onto common nodes) |
| `dedicatedNodes` | dedicated per-CT instances | tenant's **dedicated node pool** |
| `dedicatedCluster` | dedicated per-CT instances | **vcluster/Kamaji** — a separate control plane per silo |

So "shared" means *shared underlying compute*, not shared planes. This is realised with the
machinery the chart already has: **every ClusterTenant is a `multiInstance` instance** whose
planes run in `sharedPlatform.<plane>.mode=instance` (release-local, per-CT); the `mode=shared`
path becomes vestigial (a special-case escape hatch, not the `shared`-tier default). The
**only** truly shared elements at the `shared` tier are the super-admin control-plane
(decision 2) and the underlying nodes.

Rationale (corrects the first draft, which proposed shared-singleton planes + ACL for the
`shared` tier): dedicated per-CT plane instances give true per-tenant isolation of
data/credentials/runtime **without** depending on every plane's app-level ACL being perfect,
and they **kill the resolution-ambiguity class uniformly** (decision 3) — there is no shared
plane left to disambiguate. The cost trade-off moves to *bin-packing density* on shared nodes,
not to multiplexing tenants inside one plane.

> **Confirm:** the correction explicitly named Obot, skill-registry, Cognee, operator, and
> networking. This ADR extends the same rule to **LiteLLM** (a runtime plane) and the **tenant
> DB** (per-CT database — a dedicated database on a shared Postgres at the `shared` tier, a
> dedicated Postgres at dedicated tiers). Flag if LiteLLM or the DB should instead stay shared.

### 2. The super-admin control-plane stays the *only* shared cross-silo plane

The fleet/provisioning/billing control-plane remains shared in `opencrane-system` (consistent
with ADR 0001: super-admin is the only cross-silo principal). It operates on **named**
ClusterTenants — provisioning org X, listing the fleet — which is **unambiguous by
construction** (no resolution needed; the CT name is the input). What moves out is the
*tenant-facing* data + API surface, so the shared plane never has to guess a caller's tenant.

### 3. Per-CT API + DB retires the resolution-ambiguity class — uniformly

Because every tier has a **dedicated per-CT tenant-facing API + DB instance** (decision 1),
the resolution-ambiguity class is killed **the same way at every tier**: the silo *is* the
scope, so the tenant-facing plane never infers a caller's tenant from request shape. The only
cross-silo plane left (the super-admin control-plane, decision 2) acts on **named** CTs, which
is unambiguous by construction. **PR #68's resolution shim is retired outright** — there is no
shared tenant-facing plane anywhere that needs to disambiguate. (This is strictly stronger than
the first draft's "logical partition + ACL at the `shared` tier".)

### 4. Per-CT operator owns its silo's north-south edge — at every tier

Each ClusterTenant runs its **own** operator (the existing `multiInstance` +
`requireWatchNamespace` machinery, reparented under `ClusterTenantProvisioner`) — at the
`shared` tier too, just scheduled on shared nodes. **That** operator owns its silo's
`{org}.{base}` Ingress + `DNSEndpoint` + cert binding, scoped to its namespace — never a shared
operator writing every org's ingress. **Fail-closed:** a silo with no ingress is *unreachable*,
never cross-wired to another org's host. (The single shared operator emitting every org's
ingress is the pattern being retired, not preserved.)

### 5. `dedicatedCluster` is an arm's-length provisioner (the AGPL/WeOwnAI seam)

The strongest tier provisions a vcluster/Kamaji control plane per silo via an out-of-process
`ClusterTenantProvisioner` backend — kept arm's-length so it stays the AGPL / WeOwnAI
enterprise seam rather than baked into the default substrate (consistent with ADR 0001).

## Implementation shape (post-acceptance; split into tasks)

1. **Provisioner reparent** — model **every** ClusterTenant as a `multiInstance` instance the
   `ClusterTenantProvisioner` stamps out (namespace + scoped operator + `mode=instance` planes
   + per-CT DB). `isolationTier` selects the **scheduling** (shared pool / dedicated pool /
   vcluster), not whether the planes are dedicated.
2. **Per-CT operator** — provision the namespace-scoped operator per CT (all tiers); move
   per-org ingress/DNS ownership into it (fail-closed).
3. **Tenant API/DB split** — separate the super-admin (cross-silo, named-CT) surface from the
   per-CT tenant-facing (silo-scoped) API + DB instance; delete the #68 resolution shim.
4. **Tier wiring** — `isolationTier` drives node placement / vcluster (NOT plane mode — plane
   mode is always `instance`); feeds S7's cost/footprint model.

## Alternatives considered

- **Shared-singleton planes + per-CT ACL at the `shared` tier** (this ADR's *first draft*) —
  one Obot/Cognee/etc. multiplexing all `shared`-tier tenants behind app-level ACL.
  **Rejected** on the correction in decision 1: it makes isolation depend on every plane's ACL
  being perfect, leaves data/credentials co-resident, and only *logically* partitions the
  resolution-ambiguity. Dedicated per-CT instances on shared infra cost more pods but isolate
  truly and kill the ambiguity outright.
- **Full physical separation (dedicated nodes/cluster) for every tenant** — **rejected** as the
  default: dedicated *compute* is the upgrade a customer buys (`dedicatedNodes`/
  `dedicatedCluster`); the `shared` tier bin-packs dedicated per-CT *instances* onto shared
  nodes.
- **A brand-new per-CT deployment mechanism** — **rejected** in favor of reusing the existing
  `multiInstance` + `sharedPlatform.mode=instance` machinery; a parallel mechanism would
  duplicate the isolation surface and diverge.

## Consequences

- **Unblocks S8/S9/S10.** Obot OBO brokering (S8), Zot skill storage (S9), and the
  provider-secret cutover (S10) all target a **per-CT plane** now (uniform across tiers), so
  they no longer need a placement caveat — the plane is always the tenant's own.
- **Footprint is per-CT instance stacks bin-packed by tier, not multiplexed.** Every tenant —
  even `shared` — runs its own Obot + skills + Cognee + LiteLLM + operator + DB pods; the
  `shared` tier's lever is **scheduling density on common nodes**, not fewer pods. This is more
  per-tenant pods than singleton-multiplexing would be — the deliberate cost of true isolation,
  quantified + capacity-planned by S7. Right-sizing per-CT plane requests/limits is essential to
  keep `shared`-tier density viable.
- **New per-silo failure domains + ops surface at every tier** (N operators, N plane stacks, N
  DBs — N = tenant count). Monitoring, upgrades, and resource governance must become
  fleet-aware from the `shared` tier up.
- **A bigger migration than a tier-gated one.** Because per-CT planes apply at the `shared`
  tier too, existing shared-singleton tenants must each be re-provisioned into their own
  instance — not left as-is. Sequence carefully (per-CT DB data migration; ingress cutover
  fail-closed) and stage behind the provisioner.
- **`shared`-tier isolation = dedicated per-CT instances on shared compute + S2/S5**, not
  app-level multiplexing. The honest boundary an operator states: *separate instances, shared
  nodes* — stronger than "one plane, many tenants, trust the ACL".
