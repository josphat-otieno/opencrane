# Single-stage runtime image for the OpenClaw tenant pod (build context = repo root, per CI).
#
# Nothing app-specific is baked in: OpenClaw itself is installed into the per-tenant PVC on first
# boot (see entrypoint.sh), and the official Cognee memory plugin (@cognee/cognee-openclaw) is
# installed the same way when Cognee is wired. The image only provides the Node runtime, curl, and
# the entrypoint.
FROM node:22-bookworm-slim

# curl is required by entrypoint.sh's 30s effective-contract re-pull loop. bookworm-slim ships
# without it, which silently turned that loop into a fleet-wide no-op (the pod never refreshed
# its runtime contract / openclaw.json after boot). Kept minimal: no recommends, apt lists purged.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY apps/tenant/deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create mount points for volumes
RUN mkdir -p /data/openclaw /data/secrets /shared-skills /config /etc/openclaw

ENV OPENCLAW_STATE_DIR=/data/openclaw
ENV OPENCLAW_SECRETS_DIR=/data/secrets
ENV OPENCLAW_ENCRYPTION_KEY_PATH=/etc/openclaw/encryption-key/key

EXPOSE 18789

ENTRYPOINT ["/entrypoint.sh"]
