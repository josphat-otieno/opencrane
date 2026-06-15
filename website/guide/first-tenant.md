# Create & manage tenants

A **tenant** is one person's private AI assistant. Creating a tenant provisions an
isolated OpenClaw assistant — with its own encrypted storage and its own URL — for
that employee.

## Create a tenant

```bash
oc tenants create \
  --name jente \
  --display-name "Jente" \
  --email jente@example.com
```

OpenCrane provisions the assistant and exposes it at
`https://jente.<your-domain>`. The person can now [connect to it](/guide/connect).

You can also create one declaratively:

```yaml
apiVersion: opencrane.io/v1alpha1
kind: Tenant
metadata:
  name: jente
spec:
  displayName: Jente
  email: jente@example.com
```

```bash
kubectl apply -f tenant.yaml
```

## Manage tenants

```bash
oc tenants list             # everyone's assistants
oc tenants get jente        # inspect one
oc tenants suspend jente    # scale to zero (pause)
oc tenants resume jente     # bring it back
oc tenants delete jente     # remove it
```

## Pin a version

By default a tenant installs the latest OpenClaw on first boot and can self-update.
To pin a specific version:

```yaml
spec:
  displayName: Jente
  email: jente@example.com
  openclawVersion: "2026.3.15"
```

## What's next

- [Connect to OpenClaw](/guide/connect) — how the person reaches their assistant
- [Control access](/guide/permissions) — decide what this assistant can see and do
- [Budgets & cost](/guide/budgets) — set a spend limit for this assistant
- [Audit log](/guide/audit) — review changes

See the full command set in the [CLI reference](/reference/cli).
