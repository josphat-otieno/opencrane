# Build stage
FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY libs/observability/package.json libs/observability/tsconfig.json libs/observability/
COPY libs/contracts/package.json libs/contracts/tsconfig.json libs/contracts/
COPY apps/fleet-manager/package.json apps/fleet-manager/tsconfig.json apps/fleet-manager/
RUN pnpm install --frozen-lockfile --filter @opencrane/observability --filter @opencrane/contracts --filter @opencrane/fleet-manager

COPY libs/observability/src libs/observability/src
COPY libs/contracts/src libs/contracts/src
# @opencrane/contracts' build regenerates its typed client from the control-plane
# OpenAPI spec (`pnpm generate` → openapi-typescript), so the spec must be present.
COPY apps/clustertenant-manager/openapi.json apps/clustertenant-manager/openapi.json
COPY apps/fleet-manager/src apps/fleet-manager/src
RUN pnpm --filter @opencrane/observability build
RUN pnpm --filter @opencrane/contracts build
RUN pnpm --filter @opencrane/fleet-manager build

# Runtime stage
FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/libs/observability/package.json libs/observability/
COPY --from=build /app/libs/contracts/package.json libs/contracts/
COPY --from=build /app/apps/fleet-manager/package.json apps/fleet-manager/
RUN pnpm install --frozen-lockfile --filter @opencrane/observability --filter @opencrane/contracts --filter @opencrane/fleet-manager --prod

COPY --from=build /app/libs/observability/dist libs/observability/dist
COPY --from=build /app/libs/contracts/dist libs/contracts/dist
COPY --from=build /app/apps/fleet-manager/dist apps/fleet-manager/dist

USER node

CMD ["node", "apps/fleet-manager/dist/index.js"]
