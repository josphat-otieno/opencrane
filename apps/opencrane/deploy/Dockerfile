# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json nx.json ./
# All workspace libs (shared libs + libs/backend/*/main) come in wholesale so the image never
# needs editing when a backend package is added; the root .dockerignore keeps
# node_modules/dist out of the context.
COPY libs libs
COPY apps/opencrane/scripts apps/opencrane/scripts
# @opencrane/contracts generates its typed client from the silo OpenAPI spec only (the fleet
# spec/client moved out with apps/fleet-operator, see italanta/opencrane#150).
COPY apps/opencrane/openapi.json apps/opencrane/openapi.json
COPY apps/opencrane/package.json apps/opencrane/tsconfig.json apps/opencrane/prisma.config.ts apps/opencrane/
COPY apps/opencrane/prisma apps/opencrane/prisma
# npm workspaces install: root package.json's "workspaces" field includes apps/* and website
RUN npm ci

COPY apps/opencrane/src apps/opencrane/src
# Generate Prisma client, build dependencies first, then the app
RUN npm run build -w @opencrane/server
# Stage generated Prisma client to a fixed path for the runtime stage
RUN find /app -path '*/node_modules/.prisma/client' -type d | head -1 | \
    xargs -I{} cp -r {} /generated-prisma

# Runtime stage
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
# Copy app package.json, Prisma config and prisma directory for runtime installation + migrations.
# prisma.config.ts is required at runtime: the db-migrate init container runs `prisma migrate deploy`
# from this package root, and the config declares the schema folder + migrations path.
COPY apps/opencrane/package.json apps/opencrane/prisma.config.ts apps/opencrane/
COPY apps/opencrane/prisma apps/opencrane/prisma
# Install only the app workspace's runtime dependencies
RUN npm ci --omit=dev --workspace=apps/opencrane

COPY --from=build /generated-prisma /tmp/generated-prisma
# Retrieve the generated Prisma client for the runtime stage
RUN target=$(find /app -path '*/node_modules/.prisma/client' -type d | head -1) && \
    rm -rf "$target" && \
    cp -r /tmp/generated-prisma "$target" && \
    rm -rf /tmp/generated-prisma

COPY --from=build /app/apps/opencrane/dist apps/opencrane/dist

USER node

EXPOSE 8080

CMD ["node", "apps/opencrane/dist/index.js"]
