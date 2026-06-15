#!/usr/bin/env bash
# =============================================================================
# OpenCrane Platform — GCP Bootstrap Script
#
# Interactive script that deploys a local k3d stack or a full GCP environment.
#
# Usage:
#   ./deploy.sh
#   ./deploy.sh local
#   ./deploy.sh gcp
#
# Prerequisites (by mode):
#   - local: docker, kubectl, helm, k3d
#   - gcp: gcloud, terraform >= 1.5, docker, pnpm
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${GREEN}[opencrane]${NC} $1"; }
warn()  { echo -e "${YELLOW}[opencrane]${NC} $1"; }
err()   { echo -e "${RED}[opencrane]${NC} $1" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"

# ---- Mode selection ----

DEPLOY_MODE="${1:-}"

if [[ -z "$DEPLOY_MODE" ]]; then
  if [[ -t 0 ]]; then
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   OpenCrane Platform — Deploy Target     ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo "1) Local (k3d)"
    echo "2) Cloud (GCP)"
    read -rp "Choose [1/2, default 2]: " mode_choice
    mode_choice="${mode_choice:-2}"
    case "$mode_choice" in
      1)
        DEPLOY_MODE="local"
        ;;
      2)
        DEPLOY_MODE="gcp"
        ;;
      *)
        err "Invalid choice: $mode_choice"
        exit 1
        ;;
    esac
  else
    # Preserve backwards compatibility for piped/non-interactive GCP runs.
    DEPLOY_MODE="gcp"
  fi
fi

case "$DEPLOY_MODE" in
  local)
    for cmd in docker kubectl helm k3d; do
      if ! command -v "$cmd" &>/dev/null; then
        err "Required command not found for local mode: $cmd"
        exit 1
      fi
    done

    CLUSTER_NAME="opencrane-local"
    NAMESPACE="opencrane-system"
    KEEP_CLUSTER="1"
    LOCAL_PROFILE="default"

    read -rp "Cluster name [opencrane-local]: " CLUSTER_NAME
    CLUSTER_NAME="${CLUSTER_NAME:-opencrane-local}"
    read -rp "Namespace [opencrane-system]: " NAMESPACE
    NAMESPACE="${NAMESPACE:-opencrane-system}"
    read -rp "Local profile [default/strict, default default]: " LOCAL_PROFILE
    LOCAL_PROFILE="${LOCAL_PROFILE:-default}"
    read -rp "Keep cluster after install? [Y/n]: " KEEP_INPUT
    KEEP_INPUT="${KEEP_INPUT:-Y}"
    if [[ ! "$KEEP_INPUT" =~ ^[Yy]$ ]]; then
      KEEP_CLUSTER="0"
    fi

    echo ""
    log "Starting local full-stack install"
    log "Cluster: $CLUSTER_NAME"
    log "Namespace: $NAMESPACE"
    log "Profile: $LOCAL_PROFILE"
    KEEP_CLUSTER="$KEEP_CLUSTER" CLUSTER_NAME="$CLUSTER_NAME" NAMESPACE="$NAMESPACE" LOCAL_PROFILE="$LOCAL_PROFILE" "$SCRIPT_DIR/tests/k3d-local.sh"
    exit 0
    ;;
  gcp|cloud)
    ;;
  *)
    err "Unknown deploy mode: $DEPLOY_MODE"
    err "Use 'local' or 'gcp'."
    exit 1
    ;;
esac

# ---- Pre-flight checks ----

for cmd in gcloud terraform docker pnpm; do
  if ! command -v "$cmd" &>/dev/null; then
    err "Required command not found: $cmd"
    exit 1
  fi
done

# ---- GCP feature toggles (all GCP-only extras default OFF → plain-k8s on GKE) ----
#
# Override any of these via environment variable before running, e.g.
#   ENABLE_CLOUD_DNS=1 ENABLE_CUSTOM_VPC=1 ./deploy.sh gcp
ENABLE_CUSTOM_VPC="${ENABLE_CUSTOM_VPC:-0}"
ENABLE_CLOUD_DNS="${ENABLE_CLOUD_DNS:-0}"
ENABLE_ARTIFACT_REGISTRY="${ENABLE_ARTIFACT_REGISTRY:-0}"
ENABLE_GCS_STORAGE="${ENABLE_GCS_STORAGE:-0}"
# Default registry for images when Artifact Registry is disabled.
REGISTRY_URL="${REGISTRY_URL:-ghcr.io/opencrane}"

_tf_bool() { [[ "$1" == "1" ]] && echo "true" || echo "false"; }

# ---- Interactive prompts ----

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     OpenCrane Platform — GCP Deploy      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

read -rp "GCP Project ID: " PROJECT_ID
read -rp "GCP Region [europe-west1]: " REGION
REGION="${REGION:-europe-west1}"
read -rp "Base domain (e.g. opencrane.example.com): " DOMAIN
read -rp "Environment [dev]: " ENVIRONMENT
ENVIRONMENT="${ENVIRONMENT:-dev}"

IMAGE_TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'latest')"
VPC_NAME="opencrane-${ENVIRONMENT}-vpc"
CLUSTER_NAME="opencrane-${ENVIRONMENT}-cluster"

# When Artifact Registry is enabled, images live in the regional AR repo.
if [[ "$ENABLE_ARTIFACT_REGISTRY" == "1" ]]; then
  REGISTRY_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/opencrane"
fi

echo ""
log "Configuration:"
echo "  Project:            $PROJECT_ID"
echo "  Region:             $REGION"
echo "  Domain:             $DOMAIN"
echo "  Environment:        $ENVIRONMENT"
echo "  GKE mode:           Autopilot (auto-managed nodes)"
echo "  Image tag:          $IMAGE_TAG"
echo "  Registry:           $REGISTRY_URL"
echo "  Custom VPC/NAT:     $([[ "$ENABLE_CUSTOM_VPC" == 1 ]] && echo enabled || echo 'disabled (default VPC)')"
echo "  Artifact Registry:  $([[ "$ENABLE_ARTIFACT_REGISTRY" == 1 ]] && echo enabled || echo 'disabled (external registry)')"
echo "  Cloud DNS:          $([[ "$ENABLE_CLOUD_DNS" == 1 ]] && echo enabled || echo 'disabled (manual DNS)')"
echo "  GCS tenant storage: $([[ "$ENABLE_GCS_STORAGE" == 1 ]] && echo enabled || echo 'disabled (PVC storage)')"
echo ""
read -rp "Proceed? [Y/n]: " CONFIRM
CONFIRM="${CONFIRM:-Y}"
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# ---- Step 1: Configure gcloud ----

log "Step 1/7 — Configuring gcloud..."

gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"

# Enable required APIs. Only the core set is needed for a plain-k8s GKE deploy;
# Artifact Registry / Cloud DNS APIs are added only when those extras are enabled.
APIS=(
  container.googleapis.com
  compute.googleapis.com
  iam.googleapis.com
  cloudresourcemanager.googleapis.com
)
[[ "$ENABLE_ARTIFACT_REGISTRY" == "1" ]] && APIS+=(artifactregistry.googleapis.com)
[[ "$ENABLE_CLOUD_DNS" == "1" ]] && APIS+=(dns.googleapis.com)

log "Enabling GCP APIs..."
gcloud services enable "${APIS[@]}" --quiet

# ---- Step 2: Terraform init ----

log "Step 2/7 — Initialising Terraform..."
cd "$TF_DIR"
terraform init -upgrade

# ---- Step 3: Write tfvars ----

log "Step 3/7 — Writing terraform.tfvars..."

ENV_DIR="$TF_DIR/environments/${ENVIRONMENT}"
mkdir -p "$ENV_DIR"

cat > "$ENV_DIR/terraform.tfvars" <<EOF
# Auto-generated by deploy.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

project_id  = "${PROJECT_ID}"
region      = "${REGION}"
environment = "${ENVIRONMENT}"
domain      = "${DOMAIN}"
image_tag   = "${IMAGE_TAG}"

# GKE (Autopilot — Google manages nodes)
cluster_name = "${CLUSTER_NAME}"

# Registry for OpenCrane images (used when Artifact Registry is disabled).
registry_url = "${REGISTRY_URL}"

# GCP-only extras — all default OFF → plain-k8s on GKE.
enable_custom_vpc        = $(_tf_bool "$ENABLE_CUSTOM_VPC")
enable_artifact_registry = $(_tf_bool "$ENABLE_ARTIFACT_REGISTRY")
enable_cloud_dns         = $(_tf_bool "$ENABLE_CLOUD_DNS")
enable_gcs_storage       = $(_tf_bool "$ENABLE_GCS_STORAGE")
vpc_name                 = "${VPC_NAME}"
EOF

log "Wrote $ENV_DIR/terraform.tfvars"

# ---- Step 4: Terraform apply (cluster + optional infra) ----

log "Step 4/7 — Provisioning the GKE cluster (and any enabled extras)..."
TF_TARGETS=(-target=module.gke)
[[ "$ENABLE_CUSTOM_VPC" == "1" ]] && TF_TARGETS+=(-target=module.networking)
[[ "$ENABLE_ARTIFACT_REGISTRY" == "1" ]] && TF_TARGETS+=(-target=module.artifact_registry)
terraform apply \
  -var-file="environments/${ENVIRONMENT}/terraform.tfvars" \
  "${TF_TARGETS[@]}" \
  -auto-approve

# ---- Step 5: Build & push Docker images ----

log "Step 5/7 — Building and pushing Docker images to ${REGISTRY_URL}..."

# Authenticate Docker with the target registry.
if [[ "$ENABLE_ARTIFACT_REGISTRY" == "1" ]]; then
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
else
  warn "Using external registry ${REGISTRY_URL}. Ensure 'docker login' is already done"
  warn "(e.g. for ghcr.io: echo \$GHCR_TOKEN | docker login ghcr.io -u USER --password-stdin)."
fi

# Get GKE credentials for kubectl
gcloud container clusters get-credentials "$CLUSTER_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID"

cd "$REPO_ROOT"

# Generate Prisma migration files before building images
log "Generating Prisma migration..."
cd apps/control-plane
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
npx prisma generate
npx prisma migrate dev --name init --create-only 2>/dev/null || true
cd "$REPO_ROOT"

# Build control-plane (includes UI)
log "Building control-plane image..."
docker build \
  -f apps/control-plane/deploy/Dockerfile \
  -t "${REGISTRY_URL}/control-plane:${IMAGE_TAG}" \
  -t "${REGISTRY_URL}/control-plane:latest" \
  .

docker push "${REGISTRY_URL}/control-plane:${IMAGE_TAG}"
docker push "${REGISTRY_URL}/control-plane:latest"

# Build operator
log "Building operator image..."
docker build \
  -f apps/operator/deploy/Dockerfile \
  -t "${REGISTRY_URL}/operator:${IMAGE_TAG}" \
  -t "${REGISTRY_URL}/operator:latest" \
  .

docker push "${REGISTRY_URL}/operator:${IMAGE_TAG}"
docker push "${REGISTRY_URL}/operator:latest"

# ---- Step 6: Terraform apply (full — App + DNS) ----

log "Step 6/7 — Deploying platform (PostgreSQL, OpenCrane, DNS)..."
cd "$TF_DIR"
terraform apply \
  -var-file="environments/${ENVIRONMENT}/terraform.tfvars" \
  -auto-approve

# ---- Step 7: Output summary ----

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║             OpenCrane Platform — Deployed!           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

INGRESS_IP=$(terraform output -raw ingress_ip)
CONTROL_PLANE_URL=$(terraform output -raw control_plane_url)

log "Ingress IP:           $INGRESS_IP"
log "Control-plane URL:    $CONTROL_PLANE_URL"
log "Registry:             $REGISTRY_URL"
echo ""

if [[ "$ENABLE_CLOUD_DNS" == "1" ]]; then
  DNS_NS=$(terraform output -json dns_name_servers)
  warn "ACTION REQUIRED — Delegate your domain's NS records:"
  echo "  Domain: $DOMAIN"
  echo "  Name servers:"
  echo "$DNS_NS" | tr -d '[]"' | tr ',' '\n' | sed 's/^ */    /'
else
  warn "ACTION REQUIRED — Point DNS at the ingress IP at your DNS provider:"
  echo "  A     ${DOMAIN}        -> ${INGRESS_IP}"
  echo "  A     *.${DOMAIN}      -> ${INGRESS_IP}"
  echo ""
  echo "  (Or re-run with ENABLE_CLOUD_DNS=1 to let Terraform manage Cloud DNS.)"
fi
echo ""
log "Once DNS propagates, your platform is live at: $CONTROL_PLANE_URL"
log "Create tenants via: kubectl apply -f <tenant-cr.yaml>"
echo ""
