# ClusterTenant vs UserTenant

OpenCrane has a **two-tier tenancy model**, with the platform control plane
sitting above both at the apex. Getting these two concepts straight is the key to
the whole mental model.

## ClusterTenant — the customer / isolation unit

A **ClusterTenant** is a customer or instance: a cluster-scoped resource that owns

- a **namespace**,
- a **`ResourceQuota`** and **`LimitRange`**,
- a **compute isolation tier** (`isolationTier`), and
- its own **base domain** (e.g. `acme.ai.example.com`).

One customer maps to one multi-instance OpenCrane instance. ClusterTenants are
managed through `/api/v1/cluster-tenants` and the `oc cluster-tenant` commands.

### Isolation tiers

| Tier | Meaning |
|------|---------|
| `shared` | Bin-packed onto shared nodes |
| `dedicatedNodes` | A tainted, dedicated node pool |
| `dedicatedCluster` | An external provisioner (rejected until a provisioner is registered) |

## UserTenant — the per-user agent gateway

A **UserTenant** is one employee's OpenClaw agent gateway. It is a namespaced CRD
— the canonical name is *UserTenant*, though the CRD kind is still `Tenant` in
code. A UserTenant runs **inside its parent ClusterTenant's namespace** and is
exposed at `<user>.<ClusterTenant-domain>` (e.g. `mike.acme.ai.example.com`).

## The DNS hierarchy

```
opencrane.ai                      ← platform control plane (apex)
admin.opencrane.ai                ← control-plane API
  acme.ai.example.com             ← a ClusterTenant base domain
    mike.acme.ai.example.com      ← a UserTenant gateway
    jane.acme.ai.example.com      ← another UserTenant gateway
```

## Single-install mode

If you never create an explicit ClusterTenant, OpenCrane runs in **single-install
mode** — byte-for-byte the original single-customer behaviour. Multi-instance and
ClusterTenants are entirely opt-in. See [Multi-instance](/operators/multi-instance).

::: tip Canonical reference
The authoritative tenancy model lives in
[`docs/agents/cluster-architecture.md` → Tenancy Model](https://github.com/opencrane/opencrane/blob/main/docs/agents/cluster-architecture.md#tenancy-model--clustertenant-vs-usertenant).
:::
