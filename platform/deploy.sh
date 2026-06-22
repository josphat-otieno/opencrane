#!/usr/bin/env bash
# =============================================================================
# OpenCrane — deploy dispatcher
#
# Thin menu that routes to the focused deploy scripts. Pick the one that matches
# your target and run it directly for the full set of flags:
#
#   ./platform/deploy-single-tenant.sh — ONE seeded org; manager/billing off (profile)
#   ./platform/deploy-multi-tenant.sh  — self-service orgs + billing on (profile)
#   ./platform/vps-deploy.sh   — single machine (VM / VPS) via k3s
#   ./platform/k8s-deploy.sh   — an existing Kubernetes cluster (any provider; the core)
#   ./platform/gke-deploy.sh   — provision + deploy on Google Kubernetes Engine
#
# The two *-tenant.sh scripts are thin PROFILES over the shared core (k8s-deploy.sh)
# so they cannot diverge. For laptop/dev: ./platform/install.sh local  (k3d).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYAN='\033[0;36m'; NC='\033[0m'

target="${1:-}"
if [[ -z "$target" ]]; then
  echo -e "${CYAN}OpenCrane — where do you want to deploy?${NC}"
  echo "  1) Single-tenant   (existing cluster: ONE seeded org, manager/billing off)"
  echo "  2) Multi-tenant    (existing cluster: self-service orgs + billing on)"
  echo "  3) VM / VPS        (single machine, installs k3s)"
  echo "  4) Existing cluster (shared core: helm install onto your kubectl context)"
  echo "  5) GKE             (provision a cluster on Google Cloud)"
  echo "  6) Local           (laptop, k3d)"
  read -rp "Choose [1-6]: " choice
  case "$choice" in
    1) target="single-tenant" ;;
    2) target="multi-tenant" ;;
    3) target="vps" ;;
    4) target="k8s" ;;
    5) target="gke" ;;
    6) target="local" ;;
    *) echo "Invalid choice"; exit 1 ;;
  esac
else
  shift
fi

case "$target" in
  single-tenant) exec "$SCRIPT_DIR/deploy-single-tenant.sh" "$@" ;;
  multi-tenant)  exec "$SCRIPT_DIR/deploy-multi-tenant.sh" "$@" ;;
  vps)        exec "$SCRIPT_DIR/vps-deploy.sh" "$@" ;;
  k8s)        exec "$SCRIPT_DIR/k8s-deploy.sh" "$@" ;;
  gke|cloud)  exec "$SCRIPT_DIR/gke-deploy.sh" "$@" ;;
  local)      exec "$SCRIPT_DIR/install.sh" local "$@" ;;
  *)          echo "Unknown target '$target' (use: single-tenant | multi-tenant | vps | k8s | gke | local)"; exit 1 ;;
esac
