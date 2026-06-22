#!/usr/bin/env bash
# =============================================================================
# OpenCrane Platform — Interactive Install Wizard
#
# Walks through configuration step-by-step and executes the chosen installer.
#
# Usage:
#   ./platform/wizard.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- Colours -----------------------------------------------------------------

BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---- Helpers -----------------------------------------------------------------

function _banner()
{
  echo ""
  echo -e "${CYAN}${BOLD}  ██████╗ ██████╗ ███████╗███╗  ██╗${NC}"
  echo -e "${CYAN}${BOLD} ██╔═══██╗██╔══██╗██╔════╝████╗ ██║${NC}"
  echo -e "${CYAN}${BOLD} ██║   ██║██████╔╝█████╗  ██╔██╗██║${NC}"
  echo -e "${CYAN}${BOLD} ██║   ██║██╔═══╝ ██╔══╝  ██║╚████║${NC}"
  echo -e "${CYAN}${BOLD} ╚██████╔╝██║     ███████╗██║ ╚███║${NC}"
  echo -e "${CYAN}${BOLD}  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚══╝  CRANE${NC}"
  echo ""
  echo -e "${DIM}  Multi-tenant AI agent platform on Kubernetes${NC}"
  echo ""
}

function _step()
{
  echo ""
  echo -e "${BLUE}${BOLD}──────────────────────────────────────────────────${NC}"
  echo -e " ${BOLD}$1${NC}"
  echo -e "${BLUE}${BOLD}──────────────────────────────────────────────────${NC}"
  echo ""
}

function _prompt()
{
  local label="$1"
  local default="${2:-}"
  local var_name="$3"

  if [[ -n "$default" ]]; then
    printf "  ${BOLD}%s${NC} ${DIM}[%s]${NC}: " "$label" "$default"
  else
    printf "  ${BOLD}%s${NC}: " "$label"
  fi

  read -r input
  if [[ -z "$input" && -n "$default" ]]; then
    input="$default"
  fi

  # Assign to the caller's variable name via printf to a temp var
  printf -v "$var_name" '%s' "$input"
}

function _check()
{
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} $cmd"
  else
    echo -e "  ${RED}✗${NC} $cmd ${RED}(not found — install before continuing)${NC}"
    return 1
  fi
}

function _summary_row()
{
  printf "  ${DIM}%-22s${NC} ${BOLD}%s${NC}\n" "$1" "$2"
}

# ---- Welcome -----------------------------------------------------------------

_banner

echo -e "${DIM}  This wizard will walk you through installing OpenCrane.${NC}"
echo -e "${DIM}  Press Enter to accept defaults shown in [brackets].${NC}"

# ---- Step 1: Choose mode -----------------------------------------------------

_step "Step 1 of 6 — Install target"

echo -e "  Where do you want to install OpenCrane?\n"
echo -e "  ${BOLD}1)${NC} Local   — k3d cluster on this machine (development / full stack)"
echo -e "  ${BOLD}2)${NC} GCP     — Google Cloud (production / staging)"
echo ""
printf "  ${BOLD}Choose [1/2]${NC}: "
read -r mode_choice
mode_choice="${mode_choice:-1}"

case "$mode_choice" in
  1) mode="local" ;;
  2) mode="gcp" ;;
  *)
    echo -e "${RED}  Invalid choice: $mode_choice${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "  ${GREEN}✓${NC} Target: ${BOLD}$mode${NC}"

# ---- Step 2: Gather config ---------------------------------------------------

if [[ "$mode" == "local" ]]; then

  _step "Step 2 of 6 — Local cluster settings"

  _prompt "Cluster name"    "opencrane-local"   CLUSTER_NAME
  _prompt "Namespace"       "opencrane-system"  NAMESPACE
  _prompt "Local profile (default/strict)" "default" LOCAL_PROFILE

  echo ""
  printf "  ${BOLD}Keep cluster after install?${NC} ${DIM}[Y/n]${NC}: "
  read -r keep_input
  keep_input="${keep_input:-Y}"
  if [[ "$keep_input" =~ ^[Yy]$ ]]; then
    KEEP_CLUSTER="1"
    keep_label="yes"
  else
    KEEP_CLUSTER="0"
    keep_label="no"
  fi

else

  _step "Step 2 of 6 — GCP configuration"

  _prompt "GCP Project ID"              ""               PROJECT_ID
  _prompt "Region"                      "europe-west1"   REGION
  _prompt "Base domain"                 ""               DOMAIN
  _prompt "Environment"                 "dev"            ENVIRONMENT

  if [[ -z "$PROJECT_ID" ]]; then
    echo -e "\n  ${RED}✗  GCP Project ID is required.${NC}"
    exit 1
  fi
  if [[ -z "$DOMAIN" ]]; then
    echo -e "\n  ${RED}✗  Base domain is required.${NC}"
    exit 1
  fi

fi

# ---- Step 3: Platform-operator seed ------------------------------------------
#
# Optional, per-cluster bootstrap of the FIRST platform operator. The caller whose
# VERIFIED OIDC email equals this becomes a platform operator (OR-ed with any IdP
# group mapping). Press Enter to SKIP — an empty seed grants operator to nobody
# (fail-closed). This is never persisted in the repo; it is passed to the installer
# at deploy time only.

_step "Step 3 of 6 — Platform-operator seed (optional)"

echo -e "  ${DIM}Bootstrap the first platform operator by email — useful before you"
echo -e "  have an IdP group mapping. The caller whose VERIFIED OIDC email matches"
echo -e "  becomes a platform operator. Leave blank to skip (nobody is seeded).${NC}"
echo ""
_prompt "Platform-operator seed email (Enter to skip)" "" PLATFORM_OPERATOR_SEED_EMAIL

if [[ -n "$PLATFORM_OPERATOR_SEED_EMAIL" ]]; then
  seed_label="$PLATFORM_OPERATOR_SEED_EMAIL"
  echo ""
  echo -e "  ${GREEN}✓${NC} Will seed platform operator: ${BOLD}$PLATFORM_OPERATOR_SEED_EMAIL${NC}"
else
  seed_label="(none — fail-closed)"
  echo ""
  echo -e "  ${DIM}No seed — platform-operator access is granted only via IdP groups.${NC}"
fi

# ---- Step 4: TLS / cert-manager ----------------------------------------------
#
# Three modes mirror k8s-deploy.sh Step 2.5: off (TLS handled elsewhere), selfSigned
# (dev/local — not browser-trusted), and acme/DNS-01 (production wildcard via Cloud DNS).
# acme additionally collects the ACME contact email and (for an external zone) a
# service-account key file. The choices flow to the installer as env vars (same pattern
# as the operator seed); k8s-deploy.sh re-validates and runs the DNS-01 preflight.

_step "Step 4 of 6 — TLS / certificates"

echo -e "  How should OpenCrane obtain TLS certificates?\n"
echo -e "  ${BOLD}1)${NC} Off        — TLS terminated elsewhere (load balancer / external ingress)"
echo -e "  ${BOLD}2)${NC} Self-signed — dev / k3d / bare IP (instant, NOT browser-trusted)"
echo -e "  ${BOLD}3)${NC} ACME (DNS-01) — production wildcard via Let's Encrypt + Google Cloud DNS"
echo ""
printf "  ${BOLD}Choose [1/2/3]${NC}: "
read -r cert_choice
cert_choice="${cert_choice:-1}"

CERT_MODE_ENV="off"
ACME_EMAIL=""
DNS01_PROVIDER=""
DNS01_CREDENTIALS=""

case "$cert_choice" in
  1)
    cert_label="off"
    ;;
  2)
    CERT_MODE_ENV="selfSigned"
    cert_label="self-signed"
    ;;
  3)
    CERT_MODE_ENV="acme"
    DNS01_PROVIDER="clouddns"
    _prompt "ACME contact email" "" ACME_EMAIL
    if [[ -z "$ACME_EMAIL" ]]; then
      echo -e "\n  ${RED}✗  ACME mode requires a contact email.${NC}"
      exit 1
    fi
    echo ""
    echo -e "  ${DIM}On GKE Workload Identity the cert-manager service account needs"
    echo -e "  roles/dns.admin on the DNS zone's project. For an EXTERNAL zone, supply a"
    echo -e "  service-account key file below (Enter to skip = Workload Identity).${NC}"
    echo ""
    _prompt "Cloud DNS SA key file (Enter for Workload Identity)" "" DNS01_CREDENTIALS
    cert_label="acme / DNS-01 (clouddns)"
    ;;
  *)
    echo -e "${RED}  Invalid choice: $cert_choice${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "  ${GREEN}✓${NC} TLS: ${BOLD}$cert_label${NC}"

# ---- Step 5: Pre-flight check ------------------------------------------------

_step "Step 5 of 6 — Pre-flight checks"

has_error=0

if [[ "$mode" == "local" ]]; then
  _check docker  || has_error=1
  _check kubectl || has_error=1
  _check helm    || has_error=1
  _check k3d     || has_error=1
else
  _check gcloud    || has_error=1
  _check terraform || has_error=1
  _check docker    || has_error=1
  _check pnpm      || has_error=1
fi

if [[ "$has_error" == "1" ]]; then
  echo ""
  echo -e "  ${RED}One or more required tools are missing. Install them and re-run the wizard.${NC}"
  exit 1
fi

echo ""
echo -e "  ${GREEN}✓${NC} All required tools found."

# ---- Step 5: Summary + confirm -----------------------------------------------

_step "Step 6 of 6 — Summary"

echo ""
if [[ "$mode" == "local" ]]; then
  _summary_row "Mode"           "local (k3d)"
  _summary_row "Cluster name"   "$CLUSTER_NAME"
  _summary_row "Namespace"      "$NAMESPACE"
  _summary_row "Profile"        "$LOCAL_PROFILE"
  _summary_row "Keep cluster"   "$keep_label"
  _summary_row "Operator seed"  "$seed_label"
  _summary_row "TLS"            "$cert_label"
  _summary_row "Script"         "platform/tests/k3d-local.sh"
else
  _summary_row "Mode"           "GCP"
  _summary_row "Project ID"     "$PROJECT_ID"
  _summary_row "Region"         "$REGION"
  _summary_row "Domain"         "$DOMAIN"
  _summary_row "Environment"    "$ENVIRONMENT"
  _summary_row "Operator seed"  "$seed_label"
  _summary_row "TLS"            "$cert_label"
  _summary_row "Script"         "platform/deploy.sh"
fi
echo ""

printf "  ${BOLD}Everything looks good. Proceed?${NC} ${DIM}[Y/n]${NC}: "
read -r confirm
confirm="${confirm:-Y}"
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo ""
  echo -e "  ${YELLOW}Aborted.${NC}"
  exit 0
fi

# ---- Execute -----------------------------------------------------------------

echo ""
echo -e "${GREEN}${BOLD}  ✦ Starting install...${NC}"
echo ""

# The per-cluster operator seed and the cert-manager choice both flow through as env
# vars the installers honour: k3d-local.sh / k8s-deploy.sh read
# OPENCRANE_PLATFORM_OPERATOR_SEED_EMAIL and the OPENCRANE_CERT_* set below, passing each
# to Helm/Step-2.5 only when non-empty. Empty seed → operator granted to nobody; cert
# mode "off" → no cert-manager. k8s-deploy.sh re-validates and runs the DNS-01 preflight.
if [[ "$mode" == "local" ]]; then
  KEEP_CLUSTER="$KEEP_CLUSTER" \
  CLUSTER_NAME="$CLUSTER_NAME" \
  NAMESPACE="$NAMESPACE" \
  LOCAL_PROFILE="$LOCAL_PROFILE" \
  OPENCRANE_PLATFORM_OPERATOR_SEED_EMAIL="$PLATFORM_OPERATOR_SEED_EMAIL" \
  OPENCRANE_CERT_MODE="$CERT_MODE_ENV" \
  OPENCRANE_ACME_EMAIL="$ACME_EMAIL" \
  OPENCRANE_DNS01_PROVIDER="$DNS01_PROVIDER" \
  OPENCRANE_DNS01_CREDENTIALS="$DNS01_CREDENTIALS" \
    "$SCRIPT_DIR/tests/k3d-local.sh"
else
  printf "%s\n%s\n%s\n%s\nY\n" \
    "$PROJECT_ID" "$REGION" "$DOMAIN" "$ENVIRONMENT" \
    | OPENCRANE_PLATFORM_OPERATOR_SEED_EMAIL="$PLATFORM_OPERATOR_SEED_EMAIL" \
      OPENCRANE_CERT_MODE="$CERT_MODE_ENV" \
      OPENCRANE_ACME_EMAIL="$ACME_EMAIL" \
      OPENCRANE_DNS01_PROVIDER="$DNS01_PROVIDER" \
      OPENCRANE_DNS01_CREDENTIALS="$DNS01_CREDENTIALS" \
      "$SCRIPT_DIR/deploy.sh"
fi

echo ""
echo -e "${GREEN}${BOLD}  ✦ Done!${NC}"
echo ""
