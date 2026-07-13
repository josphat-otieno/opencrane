# @opencrane/domain-sessions — Session scoping

Mounted at: `/api/v1/sessions`.

Owns per-session dataset scope binding. Routes live in `src/routes/`, services in `src/core/`, tests in
`src/__tests__/`; the public surface is the barrel (`src/index.ts`).

See [`libs/domain/README.md`](../../README.md) for the layout, boundary rules and
how to add a peer package, and [`docs/agents/prisma.md`](../../../../docs/agents/prisma.md)
for schema ownership (`prisma/schema/sessions.prisma` where this domain owns models).
