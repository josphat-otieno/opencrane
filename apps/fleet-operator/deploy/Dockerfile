# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json nx.json ./
COPY libs libs
# @opencrane/contracts generates typed clients from BOTH OpenAPI specs — the silo
# (clustertenant-operator) and the fleet (fleet-operator) — via `npm run generate` →
# openapi-typescript, so both specs must be present before contracts builds (below).
COPY apps/clustertenant-operator/openapi.json apps/clustertenant-operator/openapi.json
COPY apps/fleet-operator/openapi.json apps/fleet-operator/openapi.json
COPY apps/fleet-operator/package.json apps/fleet-operator/tsconfig.json apps/fleet-operator/
# scripts/emit-openapi.mts runs at the tail of the fleet build,
# so the scripts dir must be present.
COPY apps/fleet-operator/scripts apps/fleet-operator/scripts
# Prisma schema + migrations: `prisma generate` (in the fleet build below) needs the schema,
# and the runtime db-migrate initContainer runs `prisma migrate deploy` over the migrations.
COPY apps/fleet-operator/prisma apps/fleet-operator/prisma
# npm workspaces install: root package.json's "workspaces" field includes apps/* and website
RUN npm ci

COPY apps/fleet-operator/src apps/fleet-operator/src
# Build all dependencies and the app. The esbuild bundles externalize node_modules deps,
# so runtime images need only the app's own deps (installed via npm ci --omit=dev --workspace).
RUN npm run build

# Runtime stage
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/fleet-operator/package.json apps/fleet-operator/
# Install only the app workspace's runtime dependencies
RUN npm ci --omit=dev --workspace=apps/fleet-operator

COPY --from=build /app/apps/fleet-operator/dist apps/fleet-operator/dist
# Schema + migrations for the db-migrate initContainer (`node dist/scripts/migrate.js` →
# `npx prisma migrate deploy`). The generated client itself ships inside dist/generated/prisma.
COPY --from=build /app/apps/fleet-operator/prisma apps/fleet-operator/prisma

USER node

CMD ["node", "apps/fleet-operator/dist/index.js"]
