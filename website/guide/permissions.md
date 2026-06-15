# Control access

Every assistant is **locked down by default**. You decide what each one can reach —
which knowledge, tools, and skills — using **access policies**.

## Grants and scopes

A policy is a set of **grants**. Each grant allows (or denies) something for a
principal — a person, a team, or a project — at one of four scopes:

```
org  ▸  department  ▸  project  ▸  personal
```

Policies are **deny-by-default**: an assistant can only reach what a grant
explicitly allows.

## What policies control

- **Organizational knowledge** — which datasets an assistant can retrieve from.
- **Tools (MCP servers)** — which external systems it can call.
- **Skills** — which skill bundles it's entitled to.

## Manage policies

```bash
oc policies list
oc policies create -f policy.yaml
oc policies get <name>
oc policies update <name> -f policy.yaml
oc policies delete <name>
```

Changes take effect on the assistant's next request — grants are pushed live and
revocation is near-immediate.

## Related

- [Add skills](/guide/skills)
- [Connect tools](/guide/tools)
- [Organizational knowledge](/guide/knowledge)
