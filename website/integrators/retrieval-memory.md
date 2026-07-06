# OpenCrane memory layer (Cognee retrieval)

OpenCrane's **organisational memory** is a Cognee-backed knowledge layer that tenant
agents query during the agentic loop. This page covers write-through ingest, dataset
isolation, AccessPolicy mapping, and freshness controls.

> See also:
> [Silo IAM: inheritance & sharing](/integrators/silo-iam) — how IAM groups drive Cognee dataset
> memberships, resource share-groups, and the retrieval scope precedence cascade.
> [MCP gateway (Obot)](/integrators/mcp-gateway) — the runtime plane that routes agent tool calls,
> and where workspace layering (MEMORY.md, TOOLS.md) sits.

::: info Not the same as the agent's own workspace memory
The per-agent `MEMORY.md` file seeded into each tenant pod is an L2 scratch document —
the agent's own notes. This page covers the **Cognee retrieval plane**: org knowledge
shared across agents, not the individual agent's workspace.
:::

## Current state

The core path is **cut over and live**; some controls remain deferred:

- ✅ Retrieval is **direct** from the OpenClaw runtime to Cognee; the control plane is
  not in the retrieval request path.
- ✅ The control plane translates **AccessPolicy outcomes into Cognee dataset
  memberships and grants** (with projection-drift detection and repair routes).
- ✅ Memory path cut over from PostgreSQL-only retrieval to **Cognee write-through**.
- ⏸️ **Deferred:** the full freshness/invalidation implementation (see §Freshness below),
  source-permission propagation hardening, and self-hosted Cognee audit-log parity.

The sections below describe the full design; treat ⏸️-noted parts as target behaviour.

## Architecture summary

OpenCrane uses a source-agnostic memory pattern:

1. OpenClaw remains the source integration layer.
2. Cognee remains the memory orchestration layer.

```
Org sources (SoR) → OpenClaw source tools → Cognee datasets → retrieval response
```

Org sources include SharePoint, Google Workspace, ERP systems, docs/wiki systems,
ticketing systems, and similar enterprise systems.

### Connector responsibilities

- OpenClaw handles source-specific auth, traversal, delta sync, and ACL extraction.
- OpenClaw normalises content and metadata before persistence.
- Cognee handles memory storage and orchestration after bytes and metadata arrive.
- Retrieval responses preserve source ACL semantics through dataset placement and
  OpenClaw filtering.

## Write-through pattern

OpenCrane uses a tiered write-through approach:

1. Deterministic baseline ingest on successful source reads.
2. Explicit high-value persistence via agent "remember" behaviour.

Baseline ingest writes metadata and a summary so memory is useful by default. Explicit
persistence captures high-signal findings with stronger provenance.

## Dataset granularity and isolation

Cognee datasets are the permission unit.

The target dataset model is hierarchical:

- Org-wide datasets (shared within tenant boundaries).
- Team-wide datasets.
- Project-wide datasets.
- Personal datasets.

The control plane binds tenants to project, team, and department datasets. This design
balances strict separation with manageable dataset growth.

::: tip Isolation sits on the ACL, not the datasets parameter
The Cognee permissions ACL (`/v1/permissions/…`) is the isolation boundary — not the
`datasets=` query parameter. Passing arbitrary dataset names in a retrieval request does
not bypass the ACL. Datasets are a relevance partition, not a security gate.
:::

## AccessPolicy mapping

OpenCrane AccessPolicy is the source of truth for retrieval entitlements.

- The control plane manages which tenants and users can access which project and
  department datasets.
- The control plane translates policy outcomes into Cognee permission grants.
- OpenClaw enforces request-time policy checks before and after retrieval as needed.

Policy-denied retrieval returns explicit `403` responses.

## Source-permission propagation

Source ACL semantics are preserved during memory writes:

- Files are copied into Cognee datasets based on user or OpenClaw initiation.
- User action controls which data is moved where.
- OpenClaw performs policy checks before write and before response return.

If datasets are coarse, OpenClaw applies sub-dataset filtering before returning results.

## Freshness and invalidation

Each memory record stores source freshness metadata (for example an ETag or version
token).

Chosen behaviour:

1. Re-fetch when the querying user is the originating user and memory is older than
   one day.
2. Re-fetch on explicit user request.
3. Re-fetch when source edits are detected through OpenClaw actions.

This keeps memory useful while avoiding blind trust in stale records.

::: info Deferred
The full freshness and invalidation implementation is ⏸️ deferred. The behaviour above
describes the target; current deployments use the write-through baseline without
automatic invalidation.
:::

## Audit and observability

Baseline events and metrics are emitted for memory reads and writes, and for allow or
deny outcomes.

Self-hosted Cognee audit-log parity is tracked as operational hardening and follows
Cognee's self-hosted roadmap. It is not a hard blocker for initial memory cutover.

## Adoption gate

Memory cutover requires:

- Dataset granularity implementation and documentation.
- AccessPolicy to Cognee mapping implementation and conformance tests.
- Source-permission propagation implementation.
- Freshness and invalidation controls in production.
- Cross-tenant and sub-tenant access tests passing.

Optional hardening after initial cutover:

- Verify self-hosted Cognee audit completeness against OpenCrane compliance
  requirements.

## Non-goals

- Replacing source-system connectors with Cognee connectors.
- Treating memory as the source of record for enterprise documents.
- Skipping AccessPolicy in favour of memory-runtime-only ACL logic.
