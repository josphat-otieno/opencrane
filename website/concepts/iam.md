# The five planes & IAM-first identity

OpenCrane is built **identity-first**: every interaction between planes is an
authenticated, scoped, short-lived credential exchange — not a shared secret.

## The five planes

| Plane | Responsibility |
|-------|----------------|
| **Operator / control** | Reconciles CRDs, injects config + the effective contract, drift-repairs the runtime planes |
| **Tenant runtime** | Each user's isolated OpenClaw pod with a private drive and Workload Identity |
| **MCP & egress** | Headless Obot gateway, in-cluster MCP servers, per-user credential store, egress control |
| **Knowledge (Cognee)** | Retrieval and memory; tenants query it directly during the agentic loop |
| **Skill registry & delivery** | OCI/ORAS skill bundles, entitlement-gated, delivered per-read |

All planes are **config-slaved** to the control plane and reachable by tenants only
via projected tokens.

## How identities authenticate

- **Human operators** authenticate with **OIDC** (device flow for the CLI).
- **Tenant pods** use **Workload Identity** and **audience-bound projected
  ServiceAccount tokens** (~600s TTL, kubelet-rotated). Two audiences exist:
  `aud=obot-gateway` (MCP) and `aud=skill-registry` (skills).
- **Downstream credentials** (e.g. an MCP server's API key) are brokered
  **server-side** by the gateway and **never reach the tenant pod**.

## Why projected tokens, not static secrets

The legacy `OPENCLAW_GATEWAY_TOKEN` has been replaced by projected tokens. Short
TTLs mean revocation takes effect almost immediately, audiences mean a token for
one plane can't be replayed against another, and nothing long-lived sits in a pod
or a browser.

## The effective contract

The control plane compiles each tenant's grants into an **effective contract** — a
versioned document the pod re-pulls at agentic-loop boundaries. It carries the
tenant's entitled MCP servers and skills (rendered into a `TOOLS.md`), awareness
behaviour, and scope. See [Access policies & grants](/concepts/access-policies)
and [Awareness contract & retrieval](/concepts/awareness).

::: tip Canonical reference
The full IAM-first philosophy is in
[`docs/agents/architecture.md`](https://github.com/opencrane/opencrane/blob/main/docs/agents/architecture.md);
Kubernetes specifics (service accounts, RBAC, auth-less routes) are in
[`docs/agents/k8s.md`](https://github.com/opencrane/opencrane/blob/main/docs/agents/k8s.md).
:::
