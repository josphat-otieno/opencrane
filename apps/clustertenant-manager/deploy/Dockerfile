# Build stage
FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY libs/contracts/package.json libs/contracts/tsconfig.json libs/contracts/
COPY libs/awareness/package.json libs/awareness/tsconfig.json libs/awareness/
COPY libs/observability/package.json libs/observability/tsconfig.json libs/observability/
COPY apps/clustertenant-manager/scripts apps/clustertenant-manager/scripts
COPY apps/clustertenant-manager/openapi.json apps/clustertenant-manager/openapi.json
COPY apps/clustertenant-manager/package.json apps/clustertenant-manager/tsconfig.json apps/clustertenant-manager/
COPY apps/clustertenant-manager/prisma apps/clustertenant-manager/prisma
RUN pnpm install --frozen-lockfile --filter @opencrane/contracts --filter @opencrane/awareness --filter @opencrane/observability --filter @opencrane/clustertenant-manager

COPY libs/contracts/src libs/contracts/src
COPY libs/awareness/src libs/awareness/src
COPY libs/observability/src libs/observability/src
COPY apps/clustertenant-manager/src apps/clustertenant-manager/src
RUN pnpm --filter @opencrane/contracts build
RUN pnpm --filter @opencrane/awareness build
RUN pnpm --filter @opencrane/observability build
RUN pnpm --filter @opencrane/clustertenant-manager build
# Stage generated Prisma client to a fixed path for the runtime stage
RUN find /app -path '*/node_modules/.prisma/client' -type d | head -1 | \
    xargs -I{} cp -r {} /generated-prisma

# Runtime stage
FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/libs/contracts/package.json libs/contracts/
COPY --from=build /app/libs/awareness/package.json libs/awareness/
COPY --from=build /app/libs/observability/package.json libs/observability/
COPY --from=build /app/apps/clustertenant-manager/package.json apps/clustertenant-manager/
COPY --from=build /app/apps/clustertenant-manager/prisma apps/clustertenant-manager/prisma
RUN pnpm install --frozen-lockfile --filter @opencrane/contracts --filter @opencrane/awareness --filter @opencrane/observability --filter @opencrane/clustertenant-manager --prod
COPY --from=build /generated-prisma /tmp/generated-prisma
# Retrieve the generated Prisma client for the runtime stage
RUN target=$(find /app -path '*/node_modules/.prisma/client' -type d | head -1) && \
    rm -rf "$target" && \
    cp -r /tmp/generated-prisma "$target" && \
    rm -rf /tmp/generated-prisma

COPY --from=build /app/libs/contracts/dist libs/contracts/dist
COPY --from=build /app/libs/awareness/dist libs/awareness/dist
COPY --from=build /app/libs/observability/dist libs/observability/dist
COPY --from=build /app/apps/clustertenant-manager/dist apps/clustertenant-manager/dist

USER node

EXPOSE 8080

CMD ["node", "apps/clustertenant-manager/dist/index.js"]
