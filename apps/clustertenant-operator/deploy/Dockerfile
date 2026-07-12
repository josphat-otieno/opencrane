# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json nx.json ./
# All workspace libs (shared libs + libs/domain/*/main) come in wholesale so the image never
# needs editing when a domain package is added; the root .dockerignore keeps
# node_modules/dist out of the context.
COPY libs libs
COPY apps/clustertenant-operator/scripts apps/clustertenant-operator/scripts
# @opencrane/contracts generates typed clients from BOTH OpenAPI specs (silo + fleet), so the
# fleet spec must be present too even though this is the silo image.
COPY apps/clustertenant-operator/openapi.json apps/clustertenant-operator/openapi.json
COPY apps/fleet-operator/openapi.json apps/fleet-operator/openapi.json
COPY apps/clustertenant-operator/package.json apps/clustertenant-operator/tsconfig.json apps/clustertenant-operator/
COPY apps/clustertenant-operator/prisma apps/clustertenant-operator/prisma
# npm workspaces install: root package.json's "workspaces" field includes apps/* and website
RUN npm ci

COPY apps/clustertenant-operator/src apps/clustertenant-operator/src
# Generate Prisma client, build dependencies first, then the app
RUN npm run db:generate -w @opencrane/clustertenant-operator
RUN npx nx run-many -t build --projects="@opencrane/clustertenant-operator"
# Stage generated Prisma client to a fixed path for the runtime stage
RUN find /app -path '*/node_modules/.prisma/client' -type d | head -1 | \
    xargs -I{} cp -r {} /generated-prisma

# Runtime stage
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
# Copy app package.json and prisma directory for runtime installation
COPY apps/clustertenant-operator/package.json apps/clustertenant-operator/
COPY apps/clustertenant-operator/prisma apps/clustertenant-operator/prisma
# Install only the app workspace's runtime dependencies
RUN npm ci --omit=dev --workspace=apps/clustertenant-operator

COPY --from=build /generated-prisma /tmp/generated-prisma
# Retrieve the generated Prisma client for the runtime stage
RUN target=$(find /app -path '*/node_modules/.prisma/client' -type d | head -1) && \
    rm -rf "$target" && \
    cp -r /tmp/generated-prisma "$target" && \
    rm -rf /tmp/generated-prisma

COPY --from=build /app/apps/clustertenant-operator/dist apps/clustertenant-operator/dist

USER node

EXPOSE 8080

CMD ["node", "apps/clustertenant-operator/dist/index.js"]
