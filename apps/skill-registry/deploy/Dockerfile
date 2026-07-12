# NOTE: build context is the REPO ROOT (e.g. `docker build -f apps/skill-registry/deploy/Dockerfile .`),
# not the app dir — required so the @opencrane/observability workspace dependency resolves.
# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json nx.json ./
COPY libs libs
COPY apps/skill-registry/package.json apps/skill-registry/tsconfig.json apps/skill-registry/
# npm workspaces install: root package.json's "workspaces" field includes apps/* and website
RUN npm ci

COPY apps/skill-registry/src apps/skill-registry/src
RUN npm run build

# Runtime stage
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/skill-registry/package.json apps/skill-registry/
# Install only the app workspace's runtime dependencies
RUN npm ci --omit=dev --workspace=apps/skill-registry

COPY --from=build /app/apps/skill-registry/dist apps/skill-registry/dist

USER node

EXPOSE 5000

CMD ["node", "apps/skill-registry/dist/index.js"]
