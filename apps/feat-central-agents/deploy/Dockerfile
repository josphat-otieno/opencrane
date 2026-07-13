# NOTE: build context is the REPO ROOT (e.g. `docker build -f apps/feat-central-agents/deploy/Dockerfile .`),
# not the app dir — required so the @opencrane/observability workspace dependency resolves.
# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json nx.json ./
COPY libs libs
COPY apps/feat-central-agents/package.json apps/feat-central-agents/tsconfig.json apps/feat-central-agents/
# npm workspaces install: root package.json's "workspaces" field includes apps/* and website
RUN npm ci

COPY apps/feat-central-agents/src apps/feat-central-agents/src
RUN npm run build -w @opencrane/feat-central-agents

# Runtime stage
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/feat-central-agents/package.json apps/feat-central-agents/
# Install only the app workspace's runtime dependencies
RUN npm ci --omit=dev --workspace=apps/feat-central-agents

COPY --from=build /app/apps/feat-central-agents/dist apps/feat-central-agents/dist

USER node

EXPOSE 9090

CMD ["node", "apps/feat-central-agents/dist/index.js"]
