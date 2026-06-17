#!/usr/bin/env bash
# =============================================================================
# OpenCrane — deploy dispatcher
#
# Thin menu that routes to the focused deploy scripts. Pick the one that matches
# your target and run it directly for the full set of flags:
#
#   ./platform/vps-deploy.sh   — single machine (VM / VPS) via k3s
#   ./platform/k8s-deploy.sh   — an existing Kubernetes cluster (any provider)
#   ./platform/gke-deploy.sh   — provision + deploy on Google Kubernetes Engine
#
# For laptop/dev: ./platform/install.sh local  (k3d).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYAN='\033[0;36m'; NC='\033[0m'

target="${1:-}"
if [[ -z "$target" ]]; then
  echo -e "${CYAN}OpenCrane — where do you want to deploy?${NC}"
  echo "  1) VM / VPS         (single machine, installs k3s)"
  echo "  2) Existing cluster (helm install onto your kubectl context)"
  echo "  3) GKE              (provision a cluster on Google Cloud)"
  echo "  4) Local            (laptop, k3d)"
  read -rp "Choose [1-4]: " choice
  case "$choice" in
    1) target="vps" ;;
    2) target="k8s" ;;
    3) target="gke" ;;
    4) target="local" ;;
    *) echo "Invalid choice"; exit 1 ;;
  esac
else
  shift
fi

case "$target" in
  vps)        exec "$SCRIPT_DIR/vps-deploy.sh" "$@" ;;
  k8s)        exec "$SCRIPT_DIR/k8s-deploy.sh" "$@" ;;
  gke|cloud)  exec "$SCRIPT_DIR/gke-deploy.sh" "$@" ;;
  local)      exec "$SCRIPT_DIR/install.sh" local "$@" ;;
  *)          echo "Unknown target '$target' (use: vps | k8s | gke | local)"; exit 1 ;;
esac
