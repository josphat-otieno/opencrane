# NOTE: build context is the REPO ROOT (e.g. `docker build -f apps/harvesting-agent/deploy/Dockerfile .`),
# not the app dir — required so the @opencrane/observability workspace dependency resolves.
# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json nx.json ./
COPY libs libs
COPY apps/harvesting-agent/package.json apps/harvesting-agent/tsconfig.json apps/harvesting-agent/
# npm workspaces install: root package.json's "workspaces" field includes apps/* and website
RUN npm ci

COPY apps/harvesting-agent/src apps/harvesting-agent/src
RUN npm run build -w @opencrane/harvesting-agent

# Runtime stage
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/harvesting-agent/package.json apps/harvesting-agent/
# Install only the app workspace's runtime dependencies
RUN npm ci --omit=dev --workspace=apps/harvesting-agent

COPY --from=build /app/apps/harvesting-agent/dist apps/harvesting-agent/dist

USER node

EXPOSE 9090

CMD ["node", "apps/harvesting-agent/dist/index.js"]
