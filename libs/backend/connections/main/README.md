# @opencrane/backend-connections — Gateway connections

Mounted at: (no routes — consumed by tenants/auth).

Owns OpenClaw gateway admin (kill-switch), tenant cut-off, gateway resolution, org namespaces, brokered devices. Routes live in `src/routes/`, services in `src/core/`, tests in
`src/__tests__/`; the public surface is the barrel (`src/index.ts`).

See [`libs/backend/README.md`](../../README.md) for the layout, boundary rules and
how to add a peer package, and [`docs/agents/prisma.md`](../../../../docs/agents/prisma.md)
for schema ownership (`prisma/schema/connections.prisma` where this domain owns models).
