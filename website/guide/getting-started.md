# Install OpenCrane

OpenCrane runs on your own Kubernetes cluster. This page gets the platform up and
running so you can [create your first tenant](/guide/first-tenant).

## Prerequisites

- **Kubernetes 1.28+** (a local k3d/kind cluster is fine to start; GKE for cloud)
- **Helm 3**
- **PostgreSQL 15+** (in-cluster for local; managed for production)
- A **domain** you control (for production), e.g. `opencrane.example.com`
- **Node 22+ / pnpm 10+** only if you're building from source

## Try it locally

The fastest way to see OpenCrane working:

```bash
# operator + control plane + LiteLLM + in-cluster PostgreSQL
./platform/install.sh local
```

That's enough to create tenants and explore the API and CLI on your machine.

## Install on a cluster

```bash
helm install opencrane platform/helm \
  --set ingress.domain=opencrane.example.com \
  --set controlPlane.database.existingSecret=opencrane-db
```

`ingress.domain` is **your OpenCrane domain**. The control plane lives at the apex
(`opencrane.example.com` / `admin.opencrane.example.com`) and each person's
assistant gets a subdomain like `jente.opencrane.example.com`.

TLS is issued automatically by cert-manager as a wildcard certificate. Full
deployment options (cloud adapters, storage, DNS) are in
[Hosting & deployment](/operators/hosting).

## Point the CLI at your control plane

Everything below uses the `oc` CLI:

```bash
export OPENCRANE_URL=https://admin.opencrane.example.com
export OPENCRANE_TOKEN=<your-access-token>

oc auth me      # confirm you're connected
```

## Next

→ **[Create your first tenant](/guide/first-tenant)**
