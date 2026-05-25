# Memory Infrastructure Review: Cognee vs Alternatives

## Context

OpenCrane currently uses PostgreSQL-backed document storage and metadata-driven retrieval for tenant-scoped knowledge. The next decision is whether to keep evolving this stack directly or adopt a memory orchestration layer such as Cognee.

## What Cognee Changes

Cognee introduces a higher-level memory orchestration abstraction on top of storage/retrieval primitives:

- Ingestion pipelines with memory-oriented normalization
- Memory graph/modeling and retrieval interfaces
- Potentially faster iteration on agent-memory behavior than hand-built route logic

Compared with the current route-centric implementation, Cognee shifts retrieval concerns from bespoke control-plane code into a framework-level memory runtime.

## Why We Should Consider Cognee

1. **Faster memory feature delivery**
   - Reduces custom code for memory indexing/retrieval orchestration.
2. **More structured memory semantics**
   - Can support richer memory strategies than plain text search + metadata.
3. **Clearer separation of concerns**
   - Retrieval domain behavior can live in a dedicated memory layer, not only HTTP route handlers.

## Why We Should Not Adopt Cognee Immediately

1. **Additional platform dependency**
   - Increases architectural coupling and operational risk during early platform stabilization.
2. **Migration overhead**
   - Requires mapping current tenant policy/RBAC semantics into Cognee-native abstractions.
3. **Uncertain fit for strict tenancy boundaries**
   - Must prove hard tenant isolation, policy enforcement hooks, and auditability parity.

## Alternatives (at least two)

### Alternative A — PostgreSQL + pgvector (native extension path)

- Keep current schema-first model and add vector search in Postgres.
- Pros: minimal new infra, strong control, straightforward tenancy boundaries.
- Cons: more in-house memory orchestration logic to build/maintain.

### Alternative B — LangChain/LlamaIndex orchestration over current storage

- Use mature retrieval orchestration libraries while keeping storage under OpenCrane control.
- Pros: broad ecosystem, many connector patterns, modular adapters.
- Cons: still requires careful hardening for multi-tenant policy + audit constraints.

### Alternative C — Managed vector DB stack (Qdrant/Weaviate/OpenSearch vector)

- Externalize vector retrieval infrastructure with OpenCrane policy layer in front.
- Pros: high retrieval capability, scaling features.
- Cons: operational complexity, data-governance overhead, extra tenancy-hardening work.

## Recommendation

- **Near term**: continue with current PostgreSQL-first retrieval while introducing domain-layer separation and adapter abstractions.
- **Next step**: run a short proof-of-concept comparing Cognee vs pgvector-native path vs LangChain/LlamaIndex orchestration using the same tenant policy and audit constraints.
- **Gate for adoption**: strict tenant isolation, AccessPolicy compatibility, observable performance, and operational simplicity.
