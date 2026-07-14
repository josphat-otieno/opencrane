#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Standalone-silo k3d e2e smoke test.
#
# Exercises the SILO chart (apps/opencrane-infra) on its own, in STANDALONE mode
# (deploymentMode=standalone) — no external fleet-manager anywhere. The fleet
# artifacts (apps/fleet-operator + apps/fleet-platform) moved to the WeOwnAI repo
# (italanta/opencrane#150) and no longer ship here, so the old fleet+silo
# integration test moved with them; the cross-plane "fleet provisions/manages a
# silo" assertions now live in WeOwnAI. This test proves opencrane's own
# standalone story stands up unassisted:
#
#   1. install apps/opencrane-infra alone, standalone mode;
#   2. the operator self-seeds its OWN ClusterTenant CR on boot and binds it to
#      this namespace (no fleet to do it) — `_SeedOwnClusterTenant`;
#   3. it then seeds that org's `<org>-default` workspace Tenant — the ≥1-model
#      onboarding gate is satisfied by the bootstrap provider key below, which
#      seeds a model at boot — `_SeedOwnDefaultTenant`;
#   4. the in-silo TenantOperator reconciles that Tenant CR into its openclaw
#      child resources and writes status back.
#
# The chart owns its own CRDs (crds.install) so a bare k3d cluster needs no
# pre-installed OpenCrane CRDs. cert-manager is disabled here (the CI cluster has
# no cert-manager controller); per-org domain provisioning is best-effort and
# fail-closes cleanly without cert-manager/external-dns, so manageOwnDomain stays
# on as in a real standalone install.
# ============================================================================

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
CLUSTER_NAME="${CLUSTER_NAME:-opencrane-e2e}"
NAMESPACE="${NAMESPACE:-opencrane-system}"
# Single release now — the standalone silo IS the whole install (no fleet release
# beside it). Kept as "opencrane-silo" so the silo's fullname-prefixed resources
# stay <release>-<component> (nameOverride "opencrane" is a prefix of the release
# name, so opencrane.fullname == the release name).
RELEASE_NAME="${RELEASE_NAME:-opencrane-silo}"
KEEP_CLUSTER="${KEEP_CLUSTER:-0}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-240}"
DB_STORAGE_GB="${DB_STORAGE_GB:-10}"
DISK_HEADROOM_GB="${DISK_HEADROOM_GB:-2}"
MIN_FREE_GB="${MIN_FREE_GB:-$(( DB_STORAGE_GB + DISK_HEADROOM_GB ))}"
DB_RELEASE_NAME="${DB_RELEASE_NAME:-opencrane-db}"
DB_PASSWORD="${DB_PASSWORD:-opencrane-e2e-password}"

# Standalone self-seed identity (#151 item 4). The operator creates + binds THIS
# ClusterTenant on boot, then seeds its `<org>-default` workspace Tenant.
ORG_NAME="${ORG_NAME:-e2e-org}"
ORG_DISPLAY_NAME="${ORG_DISPLAY_NAME:-E2E Org}"
OWNER_EMAIL="${OWNER_EMAIL:-e2e@example.com}"
ORG_TIER="${ORG_TIER:-shared}"
# The seeded workspace Tenant is `<org>-default` (see `_DEFAULT_TENANT_SUFFIX`).
TENANT_NAME="${ORG_NAME}-default"
# Serving host for a tenant WITH a clusterTenantRef is `<org>.<base>` (see
# `_ResolveOrgServingDomain`); ingress.domain is opencrane.local in the e2e values.
INGRESS_DOMAIN="${INGRESS_DOMAIN:-opencrane.local}"
EXPECTED_INGRESS_HOST="${ORG_NAME}.${INGRESS_DOMAIN}"

# Boot-time BYOK bootstrap (apps/opencrane-infra `bootstrap.providerKey`): the
# operator provisions this OpenAI key on boot and SEEDS A MODEL, which satisfies
# the default-tenant seed's ≥1-model onboarding gate. The key never has to be
# valid — the model row is written locally regardless of whether LiteLLM/OpenAI
# are reachable, which is all the gate checks.
BOOTSTRAP_SECRET_NAME="${BOOTSTRAP_SECRET_NAME:-opencrane-bootstrap-provider-key}"
BOOTSTRAP_OPENAI_KEY="${BOOTSTRAP_OPENAI_KEY:-sk-e2e-dummy-key}"

function _require_cmd()
{
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[e2e] Missing required command: $cmd"
    exit 1
  fi
}

function _require_docker_healthy()
{
  if ! docker info >/dev/null 2>&1; then
    echo "[e2e] Docker daemon is not reachable. Start Colima/Docker and retry."
    exit 1
  fi
}

# Retry a flaky network-bound command with linear backoff. The image builds and pulls
# below fetch base layers from Docker Hub, which intermittently times out or rate-limits
# on CI runners (e.g. `dial tcp …:443: i/o timeout` resolving node:22-bookworm-slim) and
# fails the whole job on a transient blip. A retry is safe: builds/pulls are idempotent and
# the layer cache lets a re-run resume where it left off.
function _retry()
{
  local attempts="$1"; shift
  local n=1
  until "$@"; do
    if [[ "$n" -ge "$attempts" ]]; then
      echo "[e2e] command failed after ${attempts} attempts: $*"
      return 1
    fi
    echo "[e2e] attempt ${n}/${attempts} failed; retrying in $(( n * 5 ))s: $*"
    sleep "$(( n * 5 ))"
    n=$(( n + 1 ))
  done
}

function _require_free_space()
{
  local free_kb
  local min_free_kb

  free_kb="$(df -Pk "$ROOT_DIR" | awk 'NR==2 {print $4}')"
  min_free_kb="$(( MIN_FREE_GB * 1024 * 1024 ))"

  if [[ -z "$free_kb" || "$free_kb" -lt "$min_free_kb" ]]; then
    echo "[e2e] Insufficient free disk space for image builds."
    echo "[e2e] Baseline includes DB storage (${DB_STORAGE_GB}GiB) + headroom (${DISK_HEADROOM_GB}GiB)."
    echo "[e2e] Required: ${MIN_FREE_GB}GiB, Available: $(( free_kb / 1024 / 1024 ))GiB"
    exit 1
  fi
}

function _cleanup()
{
  local exit_code=$?

  # On a failed run, dump cluster diagnostics BEFORE the teardown deletes the (otherwise lost)
  # cluster — pod/job states, recent events, and each pod's describe + current/previous logs
  # across both containers. Without this a CI failure in the deploy phase is undebuggable.
  if [[ "$exit_code" -ne 0 ]]; then
    echo "[e2e] ===== FAILURE (exit $exit_code): cluster diagnostics ====="
    kubectl get pods,jobs -n "$NAMESPACE" -o wide 2>/dev/null || true
    echo "[e2e] --- clustertenants / tenants ---"
    kubectl get clustertenants,tenants -A 2>/dev/null || true
    echo "[e2e] --- recent events ---"
    kubectl get events -n "$NAMESPACE" --sort-by=.lastTimestamp 2>/dev/null | tail -40 || true
    for p in $(kubectl get pods -n "$NAMESPACE" -o name 2>/dev/null); do
      echo "[e2e] ### describe $p"
      kubectl describe "$p" -n "$NAMESPACE" 2>/dev/null | tail -30 || true
      echo "[e2e] ### logs $p"
      kubectl logs "$p" -n "$NAMESPACE" --all-containers --tail=60 2>/dev/null || true
      kubectl logs "$p" -n "$NAMESPACE" --all-containers --previous --tail=60 2>/dev/null || true
    done
    echo "[e2e] ===== end diagnostics ====="
  fi

  if [[ "$KEEP_CLUSTER" == "1" ]]; then
    echo "[e2e] KEEP_CLUSTER=1, leaving k3d cluster '$CLUSTER_NAME' running"
    return
  fi

  echo "[e2e] Deleting k3d cluster '$CLUSTER_NAME'"
  k3d cluster delete "$CLUSTER_NAME" >/dev/null 2>&1 || true
}

# Poll until the operator has self-seeded its own ClusterTenant CR and bound it to this
# namespace (`status.boundNamespace`). This is the standalone-only step a fleet-manager
# would otherwise own; it must complete before the default-workspace seed can find an org.
function _wait_for_clustertenant_bound()
{
  local deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))

  while [[ $(date +%s) -lt $deadline ]]; do
    local bound
    bound="$(kubectl get clustertenant "$ORG_NAME" -o jsonpath='{.status.boundNamespace}' 2>/dev/null || true)"
    if [[ "$bound" == "$NAMESPACE" ]]; then
      return 0
    fi
    sleep 2
  done

  echo "[e2e] Timed out waiting for ClusterTenant '$ORG_NAME' to bind namespace '$NAMESPACE'"
  kubectl get clustertenant "$ORG_NAME" -o yaml 2>/dev/null || true
  return 1
}

# Poll until the seeded `<org>-default` Tenant reaches status.phase=Running. The Tenant CR
# is seeded asynchronously on boot (after the ClusterTenant binds and a model is seeded), so
# this tolerates it not existing yet — jsonpath on an absent CR is empty and the loop retries.
function _wait_for_tenant_running()
{
  local deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))

  while [[ $(date +%s) -lt $deadline ]]; do
    local phase
    phase="$(kubectl get tenant "$TENANT_NAME" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
    if [[ "$phase" == "Running" ]]; then
      return 0
    fi
    sleep 2
  done

  echo "[e2e] Timed out waiting for Tenant '$TENANT_NAME' status.phase=Running"
  kubectl get tenant "$TENANT_NAME" -n "$NAMESPACE" -o yaml 2>/dev/null || true
  return 1
}

trap _cleanup EXIT

# 1. Pre-flight — fail fast when required CLIs are missing.
_require_cmd docker
_require_cmd kubectl
_require_cmd helm
_require_cmd k3d
_require_docker_healthy
_require_free_space

# 2. Build local images so e2e does not depend on pre-published GHCR tags. Each build is
#    retried — the base-image pull from Docker Hub flakes intermittently on CI runners.
echo "[e2e] Building opencrane-server (silo) image"
_retry 3 docker build -f "$ROOT_DIR/apps/opencrane/deploy/Dockerfile" -t opencrane/opencrane-server:e2e "$ROOT_DIR"

echo "[e2e] Building tenant image"
_retry 3 docker build -f "$ROOT_DIR/apps/feat-openclaw-tenant/deploy/Dockerfile" -t opencrane/tenant:e2e "$ROOT_DIR"

# 3. Create a fresh cluster for deterministic test runs.
echo "[e2e] Recreating k3d cluster '$CLUSTER_NAME'"
k3d cluster delete "$CLUSTER_NAME" >/dev/null 2>&1 || true
k3d cluster create "$CLUSTER_NAME" --agents 1

# 4a. Pre-pulling the official CloudNativePG database image (retried — registry pulls flake).
echo "[e2e] Pre-pulling official CloudNativePG database image"
_retry 3 docker pull ghcr.io/cloudnative-pg/postgresql:16

# 4b. Import images into the k3d cluster runtime.
echo "[e2e] Importing images into k3d"
k3d image import opencrane/opencrane-server:e2e --cluster "$CLUSTER_NAME"
k3d image import opencrane/tenant:e2e --cluster "$CLUSTER_NAME"
k3d image import ghcr.io/cloudnative-pg/postgresql:16 --cluster "$CLUSTER_NAME"

# 4c. DIAGNOSTIC (temporary): the db-migrate initContainer reported "No migration found
#     in prisma/migrations" despite 32 committed migrations. Print what the built image
#     actually contains so we can tell an image/COPY problem from a prisma schema-folder
#     migrations-resolution problem. Remove once the migrate path is fixed.
echo "[e2e] DIAGNOSTIC: prisma migrations/schema inside opencrane-server:e2e image"
docker run --rm --entrypoint sh opencrane/opencrane-server:e2e -c '
  echo "[img] cwd package root = apps/opencrane"
  echo "[img] prisma/migrations dirs:"; ls apps/opencrane/prisma/migrations 2>&1 | head
  echo "[img] migration.sql count:"; find apps/opencrane/prisma/migrations -name migration.sql 2>/dev/null | wc -l
  echo "[img] migration_lock.toml:"; ls -l apps/opencrane/prisma/migrations/migration_lock.toml 2>&1
  echo "[img] prisma/schema files:"; ls apps/opencrane/prisma/schema 2>&1 | head -3
  echo "[img] any migrations INSIDE prisma/schema?:"; ls apps/opencrane/prisma/schema/migrations 2>&1 | head
' || echo "[e2e] (diagnostic docker run failed — non-fatal)"

# 5. Install in-cluster PostgreSQL and publish the DATABASE_URL secrets expected by the chart.
echo "[e2e] Installing CloudNativePG Engine Operator into control plane"
helm repo add cnpg https://cloudnative-pg.github.io/charts --force-update >/dev/null
helm upgrade --install cnpg cnpg/cloudnative-pg \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --wait \
  --set-string monitoring.podMonitor.enabled=false

echo "[e2e] Bootstrapping credentials secret for PostgreSQL"
kubectl create secret generic "${DB_RELEASE_NAME}-creds" \
  -n "$NAMESPACE" \
  --from-literal=username=opencrane \
  --from-literal=password="$DB_PASSWORD" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

echo "[e2e] Applying CloudNativePG configuration layer"
cat <<EOF | kubectl apply -f -
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: ${DB_RELEASE_NAME}
  namespace: ${NAMESPACE}
spec:
  instances: 1
  enablePDB: false
  imageName: ghcr.io/cloudnative-pg/postgresql:16
  storage:
    size: ${DB_STORAGE_GB}Gi
    storageClass: local-path
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
  bootstrap:
    initdb:
      # The silo (clustertenant) opencrane-ui owns its own Prisma database. Its
      # runtime planes each get a sibling DB on the same server (own _prisma_migrations).
      database: silo
      # Owner role pinned to opencrane (NOT defaulted to the database name silo):
      # the creds secret user, every DATABASE_URL, and the CREATE DATABASE OWNER
      # statements below all use role opencrane. No backticks/dollar-refs in this
      # heredoc comment -- it is unquoted for var expansion, so they would run as
      # command substitution (bash: "owner: command not found").
      owner: opencrane
      secret:
        name: ${DB_RELEASE_NAME}-creds
      postInitApplicationSQL:
        - CREATE DATABASE obot OWNER opencrane;
        - CREATE DATABASE litellm OWNER opencrane;
EOF

echo "[e2e] Waiting for Control-Plane Database Engine to stabilize..."
kubectl wait --for=condition=Ready cluster/"${DB_RELEASE_NAME}" -n "$NAMESPACE" --timeout="${TIMEOUT_SECONDS}s"

# Note: CNPG creates a service structured as [cluster-name]-rw for write/read routes.
# Silo opencrane-ui DB secret (clustertenantManager.database.existingSecret).
kubectl create secret generic "opencrane-silo-db" \
  -n "$NAMESPACE" \
  --from-literal=DATABASE_URL="postgresql://opencrane:${DB_PASSWORD}@${DB_RELEASE_NAME}-rw.${NAMESPACE}.svc.cluster.local:5432/silo" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

# Obot dsn secret — the obot-mcp-gateway reads OBOT_SERVER_DSN from the release-prefixed
# `<release>-obot` Secret (opencrane.obotSecretName), provisioned out-of-band, not by the chart.
kubectl create secret generic "${RELEASE_NAME}-obot" \
  -n "$NAMESPACE" \
  --from-literal=dsn="postgresql://opencrane:${DB_PASSWORD}@${DB_RELEASE_NAME}-rw.${NAMESPACE}.svc.cluster.local:5432/obot" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

# LiteLLM DB secret (litellm.existingDatabaseSecret).
kubectl create secret generic "opencrane-litellm-db" \
  -n "$NAMESPACE" \
  --from-literal=DATABASE_URL="postgresql://opencrane:${DB_PASSWORD}@${DB_RELEASE_NAME}-rw.${NAMESPACE}.svc.cluster.local:5432/litellm" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

# Boot-time BYOK bootstrap key — seeds a model so the default-tenant seed's ≥1-model gate passes.
kubectl create secret generic "$BOOTSTRAP_SECRET_NAME" \
  -n "$NAMESPACE" \
  --from-literal=openaiApiKey="$BOOTSTRAP_OPENAI_KEY" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

# 6. Install ONLY the standalone silo chart, wired to the in-cluster database and images.
#    cert-manager is disabled: the CI cluster has no cert-manager controller, so the
#    chart-rendered self-managed Issuer/Certificate (certManager.enabled in standalone.yaml)
#    would reference CRDs that are absent. Per-org domain provisioning stays on
#    (manageOwnDomain, from standalone.yaml) — it fail-closes cleanly without cert-manager.
echo "[e2e] Installing standalone silo release '$RELEASE_NAME'"
helm upgrade --install "$RELEASE_NAME" "$ROOT_DIR/apps/opencrane-infra" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --values "$ROOT_DIR/apps/opencrane-infra/values/standalone.yaml" \
  --values "$ROOT_DIR/libs/k8s-platform/tests/values-k3d-e2e.yaml" \
  --set "deploymentMode=standalone" \
  --set "clustertenantManager.standaloneSeed.name=$ORG_NAME" \
  --set "clustertenantManager.standaloneSeed.displayName=$ORG_DISPLAY_NAME" \
  --set "clustertenantManager.standaloneSeed.ownerEmail=$OWNER_EMAIL" \
  --set "clustertenantManager.standaloneSeed.tier=$ORG_TIER" \
  --set "clustertenantManager.database.existingSecret=opencrane-silo-db" \
  --set "litellm.existingDatabaseSecret=opencrane-litellm-db" \
  --set "bootstrap.providerKey.existingSecret=$BOOTSTRAP_SECRET_NAME" \
  --set "certManager.enabled=false"

# Wait for the opencrane-server (skip helm --wait because local-path PVCs don't bind until a pod
# mounts them, creating a chicken-and-egg with Helm's readiness checks). Resources are prefixed
# by the release name because nameOverride (opencrane) is a prefix of it, so
# opencrane.fullname == the release name → <release>-<component>.
kubectl rollout status "deployment/${RELEASE_NAME}-opencrane-server" -n "$NAMESPACE" --timeout=180s

# Wait for LiteLLM (a silo plane) when cost routing is enabled by chart values.
if kubectl get "deployment/${RELEASE_NAME}-litellm" -n "$NAMESPACE" >/dev/null 2>&1; then
  kubectl rollout status "deployment/${RELEASE_NAME}-litellm" -n "$NAMESPACE" --timeout=240s
fi

# 7. Assert the standalone boot seeds ran: the operator created + bound its OWN ClusterTenant
#    (no fleet), then seeded the org's `<org>-default` workspace Tenant, which the in-silo
#    TenantOperator reconciles to Running.
echo "[e2e] Waiting for the self-seeded ClusterTenant '$ORG_NAME' to bind"
_wait_for_clustertenant_bound

echo "[e2e] Waiting for the seeded default Tenant '$TENANT_NAME' to reconcile"
_wait_for_tenant_running

# 8. Assert core reconciled resources exist. No per-user Ingress is asserted: the operator
#    retired per-user Ingresses — every user reaches the pod through the org host,
#    reverse-proxied to this pod's Service, so only the SA/ConfigMap/Deployment/Service/
#    encryption-key Secret are minted per tenant.
kubectl get serviceaccount "openclaw-${TENANT_NAME}" -n "$NAMESPACE" >/dev/null
kubectl get configmap "openclaw-${TENANT_NAME}-config" -n "$NAMESPACE" >/dev/null
kubectl get deployment "openclaw-${TENANT_NAME}" -n "$NAMESPACE" >/dev/null
kubectl get service "openclaw-${TENANT_NAME}" -n "$NAMESPACE" >/dev/null
kubectl get secret "openclaw-${TENANT_NAME}-encryption-key" -n "$NAMESPACE" >/dev/null

# 9. Assert status fields were written by the operator. This Tenant carries a
#    clusterTenantRef (its seeded org), so its serving host is the org apex
#    `<org>.<base>` (_ResolveOrgServingDomain). ingress.domain is opencrane.local in the
#    e2e values.
INGRESS_HOST="$(kubectl get tenant "$TENANT_NAME" -n "$NAMESPACE" -o jsonpath='{.status.ingressHost}')"
if [[ "$INGRESS_HOST" != "$EXPECTED_INGRESS_HOST" ]]; then
  echo "[e2e] Unexpected ingress host: $INGRESS_HOST (expected the org apex $EXPECTED_INGRESS_HOST)"
  exit 1
fi

echo "[e2e] PASS: standalone silo installs; operator self-seeds its ClusterTenant + default Tenant; TenantOperator reconciles it"
