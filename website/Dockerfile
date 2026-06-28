# syntax=docker/dockerfile:1

# --- Build the VitePress static site -----------------------------------------
# Built from the repo root context (`docker build -f website/Dockerfile .`) because
# the site's prebuild copies apps/clustertenant-operator/openapi.json for the API reference.
FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm docs:build

# --- Serve the static site as an unprivileged nginx --------------------------
# nginx-unprivileged runs as uid 101 and listens on 8080 — no root, consistent
# with OpenCrane's nonroot posture.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY website/deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/website/.vitepress/dist /usr/share/nginx/html
EXPOSE 8080
