# syntax=docker/dockerfile:1

# --- Build the VitePress static site -----------------------------------------
# Built from the repo root context (`docker build -f website/Dockerfile .`) so the
# workspace dependency install is reproducible. The site uses its checked-in API
# snapshot and does not import or generate the server during this build.
FROM node:22-alpine AS builder
WORKDIR /repo
COPY package.json package-lock.json tsconfig.json nx.json ./
COPY libs libs
COPY apps/opencrane apps/opencrane
COPY website website
RUN npm ci
RUN npm run docs:build

# --- Serve the static site as an unprivileged nginx --------------------------
# nginx-unprivileged runs as uid 101 and listens on 8080 — no root, consistent
# with OpenCrane's nonroot posture.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY website/deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/website/.vitepress/dist /usr/share/nginx/html
EXPOSE 8080
