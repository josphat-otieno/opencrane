# Architecture overview

OpenCrane is a central **control plane** that governs a fleet of isolated tenant
pods running inside a Kubernetes cluster. The control plane is **headless and
API-first**: every capability is reachable through the versioned REST API and the
`oc` CLI, and external UIs are just clients of the same contract.

```
┌──────────────────────────────────────────────────┐      ┌──────────────────────────────┐
│                  Control Plane                   │◄────►│  Cloud SQL + Skills Repo     │
│                admin.opencrane.ai                │      │  org / dept / team /         │
│      Express + Prisma · headless API-first       │      │  tenant / individual / state │
│  • Versioned REST API (/api/v1) + OpenAPI spec   │      └──────────────────────────────┘
│  • Obot control & config authority               │
│  • oc CLI · external UI consumers via contract   │
│  • Permission compiler · effective-contract API  │
└──────────────────────┬───────────────────────────┘
                       │  (0) config   (1) grants   (2) contract
                       ▼
        Kubernetes Cluster — operator, tenant pods, MCP & egress planes
```

## The planes

OpenCrane separates concerns into distinct in-cluster planes, each **config-slaved
to the control plane** and reachable by tenants only via short-lived projected
tokens:

- **Operator / control** — reconciles `Tenant` and `AccessPolicy` CRDs, injects
  per-tenant config and the effective contract, and drift-repairs the runtime
  planes.
- **Tenant runtime** — each user's isolated OpenClaw pod, with its own private
  drive and Workload Identity.
- **MCP & egress plane** — the headless Obot MCP gateway, in-cluster MCP servers,
  the per-user credential/token store, and the egress control plane.
- **Knowledge plane (Cognee)** — retrieval and memory; tenants query it directly
  during the agentic loop.
- **Skill registry & delivery** — OCI/ORAS-backed skill bundles, entitlement-gated
  and delivered per-read.

The numbered control flows are: **(0) config** (the control plane owns Obot's
registry and lifecycle), **(1) grants** (per-tenant compiled scope, pushed live),
**(2) contract** (the versioned effective contract the pod re-pulls at loop
boundaries), and **(3) JWT** (short-lived, audience-bound projected tokens; the
gateway injects downstream credentials server-side, never to the pod).

::: tip Canonical reference
The authoritative, in-depth architecture and identity philosophy lives in the
repository's contributor docs:
[`docs/agents/architecture.md`](https://github.com/opencrane/opencrane/blob/main/docs/agents/architecture.md)
(IAM-first identity) and
[`docs/agents/cluster-architecture.md`](https://github.com/opencrane/opencrane/blob/main/docs/agents/cluster-architecture.md)
(whole-cluster topology). The Concepts pages here distil them for a product
audience.
:::

## Two tenant concepts

OpenCrane has a **two-tier tenancy model** that's worth getting straight early:

- A **ClusterTenant** is the *customer / isolation unit* — it owns a namespace, a
  resource quota, a compute isolation tier, and its own base domain
  (`acme.ai.example.com`).
- A **UserTenant** is a *per-user OpenClaw agent gateway* (the `Tenant` CRD),
  exposed at `<user>.<ClusterTenant-domain>` (`mike.acme.ai.example.com`).

See [ClusterTenant vs UserTenant](/concepts/tenancy) for the full model.

## The browser ↔ pod connection

A human **logs in once** and touches two backends: the **control plane** (OIDC
session, management API) and their **own OpenClaw pod** (the live agent session).
The pod speaks the OpenClaw Gateway v4 WebSocket protocol; its native auth is a
pairing link, so the control plane *brokers* that link rather than minting a
parallel token. The control plane is a pure broker — it never proxies the socket.

The security posture (Option B: short-lived re-brokered credentials, a per-user
kill-switch, and transport hardening) is covered in
[Identity & connection auth](/security/identity) and the
[connection security model](/security/connection-security).

## Where to next

- [ClusterTenant vs UserTenant](/concepts/tenancy)
- [The five planes & IAM-first identity](/concepts/iam)
- [Getting Started](/guide/getting-started)
