# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json nx.json ./
# All workspace libs (shared libs + libs/backend/*/main) come in wholesale so the image never
# needs editing when a backend package is added; the root .dockerignore keeps
# node_modules/dist out of the context.
COPY libs libs
COPY apps/opencrane-api/scripts apps/opencrane-api/scripts
# @opencrane/contracts generates its typed client from the silo OpenAPI spec only (the fleet
# spec/client moved out with apps/fleet-operator, see italanta/opencrane#150).
COPY apps/opencrane-api/openapi.json apps/opencrane-api/openapi.json
COPY apps/opencrane-api/package.json apps/opencrane-api/tsconfig.json apps/opencrane-api/
COPY apps/opencrane-api/prisma apps/opencrane-api/prisma
# npm workspaces install: root package.json's "workspaces" field includes apps/* and website
RUN npm ci

COPY apps/opencrane-api/src apps/opencrane-api/src
# Generate Prisma client, build dependencies first, then the app
RUN npm run build -w @opencrane/api
# Stage generated Prisma client to a fixed path for the runtime stage
RUN find /app -path '*/node_modules/.prisma/client' -type d | head -1 | \
    xargs -I{} cp -r {} /generated-prisma

# Runtime stage
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
# Copy app package.json and prisma directory for runtime installation
COPY apps/opencrane-api/package.json apps/opencrane-api/
COPY apps/opencrane-api/prisma apps/opencrane-api/prisma
# Install only the app workspace's runtime dependencies
RUN npm ci --omit=dev --workspace=apps/opencrane-api

COPY --from=build /generated-prisma /tmp/generated-prisma
# Retrieve the generated Prisma client for the runtime stage
RUN target=$(find /app -path '*/node_modules/.prisma/client' -type d | head -1) && \
    rm -rf "$target" && \
    cp -r /tmp/generated-prisma "$target" && \
    rm -rf /tmp/generated-prisma

COPY --from=build /app/apps/opencrane-api/dist apps/opencrane-api/dist

USER node

EXPOSE 8080

CMD ["node", "apps/opencrane-api/dist/index.js"]
