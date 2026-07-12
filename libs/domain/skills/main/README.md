# @opencrane/domain-skills — Skill catalogue & bundles

Mounted at: `/api/v1/skills/catalog`, `/api/v1/skills/posture`, `/api/internal/bundles`.

Owns skill bundle publish/scan/promotion, OCI bundle store + backfill, per-skill model posture, internal bundle delivery. Routes live in `src/routes/`, services in `src/core/`, tests in
`src/__tests__/`; the public surface is the barrel (`src/index.ts`).

See [`libs/domain/README.md`](../../README.md) for the layout, boundary rules and
how to add a peer package, and [`docs/agents/prisma.md`](../../../../docs/agents/prisma.md)
for schema ownership (`prisma/schema/skills.prisma` where this domain owns models).
