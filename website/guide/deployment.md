# Local & GCP deployment

OpenCrane is **on-prem by default** with optional cloud adapters. The same Helm
chart deploys locally and to GCP; the `HostingAdapter` seam selects cloud
behaviour at runtime. See [Hosting architecture](/operators/hosting) for the full
model.

## Local deployment

```bash
# Default local stack: operator + control-plane + LiteLLM + in-cluster PostgreSQL
./platform/install.sh local

# Strict local stack: same core workloads, with prod-style Helm validation and an
# explicit LiteLLM master-key Secret matching the GCP control flow.
./platform/install.sh local --profile strict
```

The `strict` profile does **not** emulate GCP-only capabilities (Workload
Identity, GCS provisioning, External Secrets, GCE ingress, Cloud DNS). It
validates the same core wiring against stricter, production-style chart inputs.

## GCP deployment

```bash
# 1. Provision infrastructure
cd terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars   # edit with your GCP project
terraform init && terraform apply

# 2. Install the platform
helm install opencrane platform/helm \
  -f platform/helm/values/gcp.yaml \
  --set tenant.storage.gcpProject=my-project \
  --set ingress.domain=opencrane.ai \
  --set controlPlane.database.existingSecret=opencrane-cloudsql
```

Here `ingress.domain=opencrane.ai` is this instance's **ClusterTenant base
domain**. The platform control plane lives at the apex
(`opencrane.ai` / `admin.opencrane.ai`); per-user UserTenant gateways are
exposed as subdomains (`jente.opencrane.ai`) under the wildcard `*.opencrane.ai`.

For TLS, cert-manager issues a wildcard certificate via ACME DNS-01; the DNS
credentials are set API-first with `oc platform dns set`. See
[Hosting architecture](/operators/hosting) and
[Identity & connection auth](/security/identity).

## Running more than one instance

To run several isolated OpenCrane instances in a single cluster (one per
customer / ClusterTenant), see [Multi-instance](/operators/multi-instance).

## Next

- [Create your first tenant](/guide/first-tenant)
- [Runbook](/operators/runbook) — operational troubleshooting
