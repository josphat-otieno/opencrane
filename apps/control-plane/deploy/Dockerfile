# NOTE: build context is the REPO ROOT (e.g. `docker build -f apps/control-plane/deploy/Dockerfile .`),
# not the app dir — required so the Angular app's @opencrane/* library path aliases
# (libs/frontend/*, libs/domain/*, libs/contracts, …) resolve exactly as they do locally.
#
# Serves the org-admin console (apps/control-plane) as a chart-native SPA — the
# clustertenant-platform Helm chart's control-plane-spa Deployment/Service
# (controlPlaneSpa.enabled) and Ingress path-split route `/` here, `/api` + `/gateway`
# to the control-plane backend. Replaces WeOwnAI's externally-applied
# platform/Dockerfile.control-plane + deploy-org-frontend.sh (italanta/opencrane#152).

# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.base.json tsconfig.frontend.json nx.json ./
# All workspace libs (frontend/*, domain/*/main, contracts, state/*) come in wholesale so
# the image never needs editing when a lib is added; the root .dockerignore keeps
# node_modules/dist out of the context. The Angular app types against @opencrane/contracts'
# ALREADY-GENERATED src/generated/api.ts (committed source, generated intra-repo from
# apps/clustertenant-operator/openapi.json) — no OpenAPI spec or codegen step needed here.
COPY libs libs
COPY apps/control-plane apps/control-plane
# npm workspaces install: root package.json's "workspaces" field includes apps/* and website
RUN npm ci

RUN npx nx build control-plane

# Runtime stage — static SPA served by an unprivileged, non-root nginx.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY apps/control-plane/deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/apps/control-plane/browser /usr/share/nginx/html

EXPOSE 8080
