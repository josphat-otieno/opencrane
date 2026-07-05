# OpenCrane — Active Plan

> **Rebased 2026-07-05.** Implementation detail now lives in **GitHub issues** (context + todo
> checklists); this file is the sequencing index the work is driven from. When an item here is
> executed, work off the linked issue — not this file. History of everything landed before this
> rebase: `plan-done.md` + the git history of this file (the pre-rebase plan is at commit
> `700473b` and earlier).

## Current state (2026-07-05)

`main` @ `700473b`. The silo program (S1–S6) is merged: fleet/silo split, Zitadel as PDP
system-of-record with per-org OIDC login, member API (`oc cluster-tenant members`), S4
inheritance + scope vocabularies + dataset-membership sync, BYOK provider keys, same-origin
org ingress + gateway proxy (built, gated), org-memory (Cognee) wired into tenant pods.

A full vision-vs-implementation audit (2026-07-05) consolidated all open work — the prior
S-series leftovers, the open issues (#100, #105, #122 — now closed into the umbrellas), and
the audit findings — into the key issues below.

## Roadmap — execute off these issues

### Wave 1 — launch-critical (parallel, independent)

| Issue | Scope | Why first |
|-------|-------|-----------|
| [#126](https://github.com/italanta/opencrane/issues/126) — **Member onboarding & user lifecycle** | Org-admin signup (ex-#122) · member adoption on first login · internal member-workspace seeding (extend the owner-seed pattern) · `POST /tenants` membership-validation + subject binding · S4b groups-as-Zitadel-project-roles · seat caps · offboarding (retain datasets) · provisioning/deploy correctness (ex-#100) | The funnel's missing middle: invited employees can't reach a running assistant today. |
| [#127](https://github.com/italanta/opencrane/issues/127) — **Isolation & domaining production defaults** | Default-deny mandatory for multi-CT (opt-out only single-CT; ex-#105) · per-ClusterTenant hosts default-ON + purge per-usertenant domains from code/docs · encrypted tenant storage (CMEK StorageClass + preflight) · GCP smoke + live ACME e2e | Shipped defaults must match the documented security model before any multi-org production install. |

### Wave 2 — capability completion

| Issue | Scope | Dependency |
|-------|-------|------------|
| [#128](https://github.com/italanta/opencrane/issues/128) — **Obot live integration** | Verify mgmt-API/enc-at-rest knob against the live Obot (now available) · OBO push path · per-user RFC-8693 round-trip · pod-can't-reach-token-store assertion | None — unblocked by the live Obot. |
| [#129](https://github.com/italanta/opencrane/issues/129) — **Central harvesting harness over Obot MCP** | Declarative harvest jobs · executor as privileged Obot client · Slack connector re-expressed as an MCP-backed job · Teams/email/tickets = config, not code | Credentialed sources need #128; harness can start against credential-free MCP servers. |
| [#130](https://github.com/italanta/opencrane/issues/130) — **Scope-aware retrieval + per-scope memory partitioning** (S4e + P4B.7.2/.3) | ScopeContext in `@opencrane/awareness` · cascade retrieval plugin · `node_set` ingestion tagging · written-memory partitioning | Plugin can land against manual groups; full value after #126's S4b. |

### End-state substrate

| Issue | Scope | Dependency |
|-------|-------|------------|
| [#117](https://github.com/italanta/opencrane/issues/117) — **Cilium + SPIFFE identity substrate — remove Linkerd** | Cilium CNI · SPIRE/SVID issuance · per-silo `CiliumNetworkPolicy` · super-admin identity rotation/audit · Linkerd removal | After #127's floor is enforced; rollout stays additive (never less isolated than the NetworkPolicy floor). |

### Anytime

| Issue | Scope |
|-------|-------|
| [#131](https://github.com/italanta/opencrane/issues/131) — **CLI & docs polish** (low prio) | `oc providers byok` · README component-table `docker/` fix · budget-enforcement seam wording |

## Backlog — tracked, unscheduled

Everything below is issue-tracked so nothing silently drops; none are roadmapped for the launch push.

| Issue | Scope | Status |
|-------|-------|--------|
| [#133](https://github.com/italanta/opencrane/issues/133) — **Skill-bundle registry-only cutover (S9)** | Live Zot backfill run → drop `SkillBundle.content` | Needs live infra; tooling ready (`oc skills backfill`). |
| [#134](https://github.com/italanta/opencrane/issues/134) — **Operator & deploy ops hygiene** | Skill-registry env wiring · suspend self-loop `observedGeneration` guard · reconcile on config change | Small, anytime. |
| [#135](https://github.com/italanta/opencrane/issues/135) — **Provider-secret cutover (S10)** | Remove `org-shared-secrets` broadcast · retire `ProviderApiKey` | **BLOCKED external** (OpenClaw translator image + WeOwnAI). |
| [#136](https://github.com/italanta/opencrane/issues/136) — **Deferred capabilities (S7 · S12 · D4/D5)** | Dedicated-compute tiers & cost model · guardrail stream · plane pooling + scale-to-zero | Future; S11's remaining view belongs to the WeOwnAI backlog. |

Folded elsewhere: CONN.4/5 device-seam kill-or-keep → **#117** · live Cognee `/v1/search`
verification → **#130**.
