# Access policies & grants

OpenCrane controls what every assistant can reach — which knowledge datasets, MCP
servers, and skills — through **declarative access policies**, compiled centrally
and enforced at the planes.

## Grants and scopes

A **Grant** is a single allow/deny decision, scoped to one of four levels and
targeting a principal (a group, user, or tenant):

```
org  ▸  department  ▸  project  ▸  personal
```

An **AccessPolicy** is a set of grants. Policies are **deny-by-default**: an
assistant can reach only what an explicit grant allows.

## What policies control

- **Retrieval datasets** — membership in Cognee datasets by scope, which bounds
  what knowledge the assistant can retrieve.
- **MCP servers** — which integration endpoints (Slack, Jira, Salesforce, …) the
  tenant may call through the Obot gateway.
- **Skills** — which skill bundles the tenant is entitled to, delivered per-read
  by the skill registry.

## The permission compiler

The control plane is the **authority**, not the request path. It compiles
AccessPolicy outcomes into:

- **Cognee dataset memberships** (synced; the control plane never proxies the
  actual retrieval call), and
- **skill / MCP entitlements** carried in the tenant's effective contract.

Revocation is effective on the next call — grants are pushed live, and projected
tokens are short-lived.

## Managing policies

```bash
oc policies list
oc policies create -f policy.yaml
oc policies get <name>
oc policies update <name> -f policy.yaml
oc policies delete <name>
```

The same surface is available under `/api/v1/policies` — see the
[API reference](/reference/api).

## Related

- [Retrieval & memory (Cognee)](/integrators/retrieval-memory)
- [MCP gateway (Obot)](/integrators/mcp-gateway)
- [Skill registry & delivery](/integrators/skill-registry)
