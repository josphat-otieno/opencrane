# NOTE: build context is the REPO ROOT (e.g. `docker build -f apps/feat-skill-registry/deploy/Dockerfile .`),
# not the app dir — required so the @opencrane/observability workspace dependency resolves.
# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json nx.json ./
COPY libs libs
COPY apps/feat-skill-registry/package.json apps/feat-skill-registry/tsconfig.json apps/feat-skill-registry/
# npm workspaces install: root package.json's "workspaces" field includes apps/* and website
RUN npm ci

COPY apps/feat-skill-registry/src apps/feat-skill-registry/src
RUN npm run build -w @opencrane/skills-registry

# Runtime stage
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/feat-skill-registry/package.json apps/feat-skill-registry/
# Install only the app workspace's runtime dependencies
RUN npm ci --omit=dev --workspace=apps/feat-skill-registry

COPY --from=build /app/apps/feat-skill-registry/dist apps/feat-skill-registry/dist

USER node

EXPOSE 5000

CMD ["node", "apps/feat-skill-registry/dist/index.js"]
