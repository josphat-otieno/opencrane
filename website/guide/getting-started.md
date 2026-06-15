# Prerequisites & install

This page gets a development checkout of OpenCrane building and tested. For
deploying to a cluster, see [Local & GCP deployment](/guide/deployment).

## Prerequisites

- **Node 22+** and **pnpm 10+**
- **Kubernetes 1.28+** (GKE recommended for cloud; k3d/kind for local)
- **Helm 3**
- **Terraform 1.5+** (for GCP deployment)
- **PostgreSQL 15+** (Cloud SQL or local)

## Build & test the monorepo

OpenCrane is a TypeScript/pnpm monorepo (operator, control plane, CLI, skill
registry, harvesting agent, and shared libraries).

```bash
pnpm install
pnpm build
pnpm test
```

`pnpm build` generates the Prisma client and builds every package; it also emits
the OpenAPI spec (`apps/control-plane/openapi.json`) that powers the
[interactive API reference](/reference/api).

## Run the docs site locally

This documentation site is itself a workspace package:

```bash
pnpm docs:dev       # live preview at http://localhost:5173
pnpm docs:build     # production build (fails on dead links)
pnpm docs:preview   # serve the production build locally
```

The API reference is generated from `apps/control-plane/openapi.json`;
`docs:dev` / `docs:build` sync it automatically.

## Next steps

- [Local & GCP deployment](/guide/deployment) — stand up the platform.
- [Create your first tenant](/guide/first-tenant) — issue an assistant.
- [CLI reference](/reference/cli) — the full `oc` surface.
