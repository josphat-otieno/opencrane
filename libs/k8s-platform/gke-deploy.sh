#!/usr/bin/env bash
# =============================================================================
# OpenCrane — Google Kubernetes Engine (GKE) deploy
#
# Provisions a standard GKE cluster with Terraform (cluster only — on the project
# default VPC, no GCP-specific extras), then installs OpenCrane onto it with the
# published images. GKE is treated as plain Kubernetes; GCP-native extras (GCS
# storage, Cloud DNS, Artifact Registry, custom VPC) stay opt-in in Terraform.
#
# Usage:
#   ./platform/gke-deploy.sh --project-id ID [--region R] [--cluster NAME]
#                            [--base-domain D] [--yes]
#
# --base-domain (e.g. dev.opencrane.ai) is threaded to BOTH Terraform's `domain` var
# (Cloud DNS zone) and k8s-deploy.sh, so the chart, cert issuer, and DNS share one base.
#
# Prereqs: gcloud, terraform, kubectl, helm.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"

PROJECT_ID=""
REGION="europe-west1"
CLUSTER="opencrane-cluster"
BASE_DOMAIN="${OPENCRANE_BASE_DOMAIN:-}"
ASSUME_YES=0

log()  { echo -e "\033[0;32m[gke-deploy]\033[0m $1"; }
warn() { echo -e "\033[1;33m[gke-deploy]\033[0m $1"; }
err()  { echo -e "\033[0;31m[gke-deploy]\033[0m $1" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id) PROJECT_ID="$2"; shift 2 ;;
    --region)     REGION="$2"; shift 2 ;;
    --cluster)    CLUSTER="$2"; shift 2 ;;
    --base-domain) BASE_DOMAIN="$2"; shift 2 ;;
    --domain)     BASE_DOMAIN="$2"; shift 2 ;;  # backwards-compatible alias
    --yes)        ASSUME_YES=1; shift ;;
    -h|--help)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)            err "Unknown flag: $1"; exit 1 ;;
  esac
done

for c in gcloud terraform kubectl helm; do command -v "$c" >/dev/null 2>&1 || { err "Missing required command: $c"; exit 1; }; done
if [[ -z "$PROJECT_ID" && -t 0 ]]; then read -rp "GCP Project ID: " PROJECT_ID; fi
[[ -n "$PROJECT_ID" ]] || { err "--project-id is required (flag or interactive prompt)."; exit 1; }

log "Project: $PROJECT_ID   Region: $REGION   Cluster: $CLUSTER"
if [[ "$ASSUME_YES" != "1" ]]; then
  read -rp "Provision this GKE cluster and install OpenCrane? [Y/n]: " c; [[ "${c:-Y}" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

# 1. Enable the only APIs a plain cluster needs.
log "Enabling GCP APIs (container, compute)…"
gcloud services enable container.googleapis.com compute.googleapis.com --project "$PROJECT_ID" --quiet

# 2. Terraform: create the cluster ONLY (default flow — no provider bootstrap problem).
log "Provisioning the GKE cluster with Terraform…"
terraform -chdir="$TF_DIR" init -upgrade -input=false
terraform -chdir="$TF_DIR" apply -input=false -auto-approve \
  -var "project_id=$PROJECT_ID" -var "region=$REGION" -var "cluster_name=$CLUSTER" \
  ${BASE_DOMAIN:+-var "domain=$BASE_DOMAIN"}

# 3. Point kubectl at the new cluster.
log "Fetching cluster credentials…"
gcloud container clusters get-credentials "$CLUSTER" --region "$REGION" --project "$PROJECT_ID"

# 4. Install OpenCrane (published images, GKE default StorageClass).
log "Installing OpenCrane…"
"$SCRIPT_DIR/k8s-deploy.sh" ${BASE_DOMAIN:+--base-domain "$BASE_DOMAIN"}

# 5. Next steps. k8s-deploy.sh bundles ingress-nginx by default (auto-skipped if a
# controller is already present), so a fresh GKE cluster gets one with no extra step.
warn "Point your DNS at the ingress controller's external IP:  kubectl get svc -n ingress-nginx"
log "Done."
