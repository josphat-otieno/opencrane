# Harvesting Agents Strategy

## Goal Re-check

Build a tenant-safe, policy-governed harvesting system that can ingest from multiple communication and document platforms and promote selected tenant knowledge into central organizational knowledge.

## Strategy

1. **Adopt adapter-oriented connector architecture**
   - Standard connector contract (`sync`, cursor handling, normalization, error model).
   - Connector implementations become pluggable adapters.

2. **Separate domain and transport layers**
   - Domain layer owns normalization, dedupe, policy checks, and promotion rules.
   - Connector adapters only fetch and shape source payloads.

3. **Promotion logic**
   - Tenant-level ingestion first.
   - Explicit promotion path into central knowledge, governed by policy and sensitivity tagging.

4. **Observability and SLOs**
   - Per-adapter lag/failure metrics.
   - Promotion success/failure telemetry.

## Open-Source Integration Research Direction

Evaluate integrating or borrowing architecture from connector-rich ecosystems rather than hand-building every connector:

- **Airbyte-style connector model**
  - Large connector ecosystem, strong source abstraction patterns.
- **Meltano/Singer tap-target ecosystem**
  - Broad connector availability and incremental sync patterns.
- **LangChain/LlamaIndex loaders**
  - Useful ingestion primitives for many source platforms.

## Recommended Approach

- Keep current Slack implementation as a validated reference adapter.
- Add an internal adapter contract and migrate Slack onto it formally.
- Run a connector-platform spike (Airbyte-style vs Singer-style vs direct SDK adapters) focused on:
  - tenant isolation
  - cursor correctness
  - auth/secret boundaries
  - operational complexity in Kubernetes

## Phased Execution

1. **Phase A**: formalize adapter contract + migrate Slack to contract.
2. **Phase B**: add Office 365/SharePoint and Google Workspace adapters.
3. **Phase C**: add promotion-to-central-knowledge policy engine and controls.
