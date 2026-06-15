# Create your first tenant

A **UserTenant** is one employee's isolated OpenClaw assistant. You can create one
through the `oc` CLI (recommended) or by applying a `Tenant` CRD directly.

## Point the CLI at your control plane

```bash
export OPENCRANE_URL=https://admin.opencrane.ai
export OPENCRANE_TOKEN=<your-access-token>
```

## Create a tenant via the CLI

```bash
oc tenants create \
  --name jente \
  --display-name "Jente" \
  --email jente@example.com
```

The operator provisions the per-tenant resources — a GCS bucket (on GCP), a
Workload Identity service account, an encryption key, a Deployment, a Service, and
one Ingress for the UserTenant gateway. The assistant becomes reachable at
`https://jente.<ClusterTenant-domain>` under the wildcard cert.

## Or apply a CRD directly

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

## Pin an OpenClaw version

Without `openclawVersion`, tenants install `latest` on first boot and can
self-update via `openclaw update`. To pin:

```yaml
apiVersion: opencrane.io/v1alpha1
kind: Tenant
metadata:
  name: jente
spec:
  displayName: Jente
  email: jente@example.com
  openclawVersion: "2026.3.15"
```

## Inspect and manage

```bash
oc tenants list             # list all tenants
oc tenants get jente        # inspect a tenant
oc tenants suspend jente    # scale to zero
oc tenants resume jente     # bring back
oc budget spend jente       # current spend
oc audit list --tenant jente --limit 50
```

See the [CLI reference](/reference/cli) for the full command surface, and
[Access policies & grants](/concepts/access-policies) to control what knowledge,
skills, and MCP servers the tenant can reach.
