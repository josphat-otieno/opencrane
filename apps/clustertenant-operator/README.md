# @opencrane/clustertenant-operator

Express REST API that serves as the management layer for the OpenCrane platform. It provides endpoints for tenant lifecycle management, access policy administration, shared skills discovery, and audit log querying.

All mutations are dual-written: changes are applied to both Kubernetes CRDs (the operator's source of truth) and PostgreSQL via Prisma (the query store for dashboards and reporting).

## Responsibilities

| Route group | What it does |
|-------------|-------------|
| `GET/POST/DELETE /tenants` | Create, list, update, suspend/resume, and delete tenants. Writes to K8s CRD + Prisma. |
| `GET/POST/DELETE /policies` | Manage `AccessPolicy` CRs controlling tenant egress and MCP server access |
| `GET /skills` | Discover shared org/team skills from the mounted skills volume; upserts into Prisma for fast querying |
| `GET /audit` | Query the audit log with tenant, action, and time-range filters |
| `GET /healthz` | Liveness/readiness probe; reports DB connectivity status |

## Source layout

The operator is composition + reconciler wiring: it mounts domain routers, manages reconcile loops, and proxies identity and MCP connections.

```
src/
├── index.ts              # Express app factory + Kubernetes reconcile loops
├── routes.ts             # Route composition: mounts routers from @opencrane/domain-* packages
├── config.ts             # Configuration + environment variables
├── log.ts                # Logging setup
├── instrument.ts         # OpenTelemetry instrumentation
├── trusted-proxies.ts    # Trusted proxy configuration (CONN.9)
├── infra/
│   ├── membership-projection-repairer.ts  # Reconcile OrgMembership→ClusterTenant mapping
│   └── tenant-projection-repairer.ts      # Reconcile ClusterTenant spec→status
├── tenants/              # Tenant CRD reconciler
│   ├── operator.ts       # Main watch + reconcile loop
│   ├── deploy/           # Deployment builder for tenant pods
│   └── internal/         # Resolution + isolation helpers
├── policies/             # AccessPolicy CRD reconciler
│   └── operator.ts       # Watch + reconcile loop
├── tenant-rollout/       # Tenant pod rollout strategies (canary, rolling)
├── gateway-proxy/        # Identity-routing proxy (OIDC session → tenant context)
│   ├── auth-client.ts    # OIDC session validation
│   └── origin.ts         # Request routing by org host
├── mcp-gateway/          # MCP gateway deployment + health checks
├── hosting/              # Hosting adapter (cloud metadata / secret provisioning)
├── openapi/
│   └── spec.ts           # OpenAPI schema generation for all domain routers
├── scripts/
│   └── migrate.ts        # Prisma migration runner (prisma migrate deploy)
└── __tests__/            # Integration + reconciliation tests
```

```
prisma/
├── schema/
│   ├── base.prisma       # Datasource + generator config
│   ├── <domain>.prisma   # Per-domain models (tenants, policies, awareness, mcp, skills, etc.)
│   └── […18 domain files…]
└── migrations/           # Prisma migration history
```

## Configuration (environment variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP listen port |
| `DATABASE_URL` | — | PostgreSQL connection string (`postgresql://user:pass@host/db`) |
| `KUBECONFIG` / in-cluster | — | Kubernetes API access (auto-detected) |
| `INGRESS_DOMAIN` | `opencrane.local` | The ClusterTenant base domain; used to derive per-user UserTenant gateway hosts (`{usertenant}.{domain}`). See [Tenancy Model](../../docs/agents/cluster-architecture.md#tenancy-model--clustertenant-vs-usertenant). |
| `AUTH_TOKEN` | `""` | Bearer token for API access (empty = dev bypass) |
| `NODE_ENV` | `development` | Set to `production` to enforce auth |

## Database schema

```
Tenant          — mirrors the Tenant CRD status in Postgres
AccessPolicy    — mirrors the AccessPolicy CRD
AuditEntry      — append-only audit trail for all mutations
Skill           — discovered skills registry (name, scope, team, contentHash)
```

Run migrations:

```bash
npm run db:migrate -w @opencrane/clustertenant-operator   # prisma migrate deploy (production)
npm run db:generate -w @opencrane/clustertenant-operator  # regenerate Prisma client after schema changes
npm run db:push -w @opencrane/clustertenant-operator      # push schema without migrations (dev only)
```

## Development

```bash
# From repo root
npm run build                                    # compile TypeScript + generate Prisma client
npm run build -w @opencrane/clustertenant-operator  # build only this package
npm run test                                    # run vitest integration tests
npx nx run clustertenant-operator:test          # alternative NX command
```

## Docker

Built from `deploy/Dockerfile` using the repo root as build context:

```bash
docker build -f apps/clustertenant-operator/deploy/Dockerfile -t ghcr.io/opencrane/control-plane:latest .
```
