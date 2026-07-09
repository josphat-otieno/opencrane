# NOTE: build context is the REPO ROOT (e.g. `docker build -f apps/tenant/deploy/Dockerfile .`),
# not the app dir — required so the pnpm workspace + @opencrane/* deps resolve.
#
# The runtime image stays slim: OpenClaw itself is NOT baked in — it is installed into the
# per-tenant GCS bucket on first boot (see entrypoint.sh). What we DO bake in is the
# platform-owned org-memory MCP server, which OpenClaw spawns over stdio to retrieve org
# context from the per-tenant Cognee (see 2-config-map.ts `mcp.servers.org-memory`).

# Build stage — compile and bundle the org-memory MCP server into a self-contained dir.
FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY libs/awareness/package.json libs/awareness/tsconfig.json libs/awareness/
COPY apps/org-memory-mcp/package.json apps/org-memory-mcp/tsconfig.json apps/org-memory-mcp/
RUN pnpm install --frozen-lockfile --filter @opencrane/awareness --filter @opencrane/org-memory-mcp

COPY libs/awareness/src libs/awareness/src
COPY apps/org-memory-mcp/src apps/org-memory-mcp/src
# awareness must be built first: the org-memory bundle resolves @opencrane/awareness
# through its published `exports` (dist/index.js), so its dist has to exist before esbuild runs.
RUN pnpm --filter @opencrane/awareness build \
 && pnpm --filter @opencrane/org-memory-mcp bundle

# Assemble a MINIMAL deployable: a single self-contained esbuild bundle, NO node_modules.
# OpenClaw re-spawns `node /opt/org-memory-mcp/dist/index.js` over stdio on every config
# reload; shipping one file instead of a full dependency tree cuts Node's module-resolution
# file reads at cold start, shrinking the spawn->handshake window that otherwise races
# OpenClaw's connect timeout (observed as `MCP error -32000: Connection closed`). The tiny
# package.json only carries `type: module` so Node parses the bundle as ESM.
RUN mkdir -p /opt/org-memory-mcp/dist \
 && cp apps/org-memory-mcp/dist/index.js /opt/org-memory-mcp/dist/index.js \
 && printf '{"private":true,"type":"module"}\n' > /opt/org-memory-mcp/package.json

# Runtime stage — Node runtime + entrypoint + the baked org-memory MCP server.
FROM node:22-bookworm-slim

COPY --from=build /opt/org-memory-mcp /opt/org-memory-mcp

COPY apps/tenant/deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create mount points for volumes
RUN mkdir -p /data/openclaw /data/secrets /shared-skills /config /etc/openclaw

ENV OPENCLAW_STATE_DIR=/data/openclaw
ENV OPENCLAW_SECRETS_DIR=/data/secrets
ENV OPENCLAW_ENCRYPTION_KEY_PATH=/etc/openclaw/encryption-key/key

EXPOSE 18789

ENTRYPOINT ["/entrypoint.sh"]
