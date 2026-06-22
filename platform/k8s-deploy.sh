#!/usr/bin/env bash
# =============================================================================
# OpenCrane — install onto ANY Kubernetes cluster
#
# Installs OpenCrane onto the cluster your current kubectl context points at:
# CloudNativePG (in-cluster PostgreSQL) → secrets → the OpenCrane Helm chart →
# DB migrations. Uses the published ghcr.io/opencrane images and the cluster's
# default StorageClass — pure, provider-agnostic Kubernetes.
#
# This is the shared core. vps-deploy.sh and gke-deploy.sh provision a cluster
# and then call this script.
#
# Usage:
#   ./platform/k8s-deploy.sh [--domain DOMAIN] [--namespace NS] [--release NAME]
#                            [--image-tag TAG] [--storage-class SC]
#                            [--control-plane-tag TAG] [--operator-tag TAG]
#                            [--tenant-tag TAG]
#                            [--oidc-issuer-url URL] [--oidc-client-id ID]
#                            [--oidc-redirect-uri URI]
#                            [--platform-operator-seed-email EMAIL]
#                            [--cert-manager] [--acme-email EMAIL]
#                            [--dns01-provider clouddns] [--dns01-credentials FILE]
#                            [--values FILE] [--set k=v ...]
#
# TLS / cert-manager (Step 2.5) has THREE modes:
#   off (default)  — no cert-manager install; the chart renders no issuer/cert.
#                    Use when TLS is terminated elsewhere (LB, external ingress).
#   selfSigned     — `--cert-manager` alone. Installs cert-manager and a self-signed
#                    ClusterIssuer. Issues instantly, no DNS challenge, NOT browser-
#                    trusted. For dev / k3d / bare-IP clusters.
#   acme (DNS-01)  — `--cert-manager --acme-email you@org --dns01-provider clouddns
#                    [--dns01-credentials FILE]`. Installs cert-manager, waits on the
#                    webhook, runs a DNS-01 preflight that FAILS FAST with the exact
#                    remediation, then issues a browser-trusted wildcard via Let's
#                    Encrypt. Wildcards REQUIRE DNS-01 (HTTP-01 cannot issue them).
#                    On GKE Workload Identity the cert-manager SA needs roles/dns.admin
#                    on the DNS zone's project; for an external zone pass a SA-key file
#                    via --dns01-credentials (a Secret is created in the cert-manager NS).
#
# This step installs only the PLATFORM-WILDCARD issuer + cert. Per-org certs are a
# runtime concern of the ClusterTenant reconciler, NOT an install concern.
#
# --image-tag pins all three platform images (control-plane, operator, tenant)
# to the same tag. To roll a SINGLE component to a different build, pass the
# matching per-component flag (e.g. --control-plane-tag sha-abc123); it overrides
# --image-tag for that component only. ALWAYS bump component images this way —
# never `kubectl set image` / `kubectl patch` a managed deployment. An imperative
# patch creates a `kubectl-*` field manager that owns the image field on the live
# object and makes every later `helm upgrade` fail with a field-ownership conflict.
#
# The platform-operator seed email bootstraps the FIRST platform operator: the
# caller whose VERIFIED OIDC email equals it becomes a platform operator. It is a
# per-cluster INSTALL parameter — DEFAULTS TO EMPTY, which grants operator to
# nobody (fail-closed). Also accepted via the OPENCRANE_PLATFORM_OPERATOR_SEED_EMAIL
# env var. Never commit a real owner email into the repo.
#
# Prereqs: kubectl (pointed at the target cluster) and helm.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$SCRIPT_DIR/helm"

NAMESPACE="opencrane-system"
RELEASE="opencrane"
IMAGE_TAG="latest"
CONTROL_PLANE_TAG=""    # empty → falls back to IMAGE_TAG
OPERATOR_TAG=""         # empty → falls back to IMAGE_TAG
TENANT_TAG=""           # empty → falls back to IMAGE_TAG
DOMAIN=""
STORAGE_CLASS=""        # empty → cluster default StorageClass
VALUES_FILE=""
EXTRA_SET=()

# OIDC + per-cluster operator bootstrap. All default empty (OIDC stays disabled and the
# seed grants operator to nobody — fail-closed). The seed also accepts an env var so a
# secret manager / CI can supply it without it appearing on the command line.
OIDC_ISSUER_URL="${OIDC_ISSUER_URL:-}"
OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-}"
OIDC_REDIRECT_URI="${OIDC_REDIRECT_URI:-}"
PLATFORM_OPERATOR_SEED_EMAIL="${OPENCRANE_PLATFORM_OPERATOR_SEED_EMAIL:-}"

# cert-manager / TLS (Step 2.5). CERT_MANAGER stays off unless --cert-manager is given;
# the mode is then selfSigned UNLESS an --acme-email + --dns01-provider promote it to
# acme. ACME_EMAIL / DNS01_PROVIDER also accept env vars so CI/secret managers can
# supply them off the command line. DNS01_CREDENTIALS is a path to a SA-key JSON used
# only for an EXTERNAL DNS zone (Workload Identity needs no file — see _preflight_dns01).
# OPENCRANE_CERT_MODE (off|selfSigned|acme) lets the wizard preset the mode without the
# CLI flag; "off" leaves CERT_MANAGER off, anything else turns it on (acme is then driven
# by the email/provider env below). Direct callers just use --cert-manager / --acme-email.
case "${OPENCRANE_CERT_MODE:-off}" in
  off) CERT_MANAGER="off" ;;
  *)   CERT_MANAGER="on" ;;
esac
ACME_EMAIL="${OPENCRANE_ACME_EMAIL:-${ACME_EMAIL:-}}"
DNS01_PROVIDER="${OPENCRANE_DNS01_PROVIDER:-${DNS01_PROVIDER:-}}"
DNS01_CREDENTIALS="${OPENCRANE_DNS01_CREDENTIALS:-${DNS01_CREDENTIALS:-}}"
CERT_MANAGER_NAMESPACE="cert-manager"

DB_CLUSTER="opencrane-db"
DB_SECRET="opencrane-db"
DB_USER="opencrane"
DB_NAME="opencrane"
TIMEOUT="${TIMEOUT_SECONDS:-300}"

log()  { echo -e "\033[0;32m[k8s-deploy]\033[0m $1"; }
warn() { echo -e "\033[1;33m[k8s-deploy]\033[0m $1"; }
err()  { echo -e "\033[0;31m[k8s-deploy]\033[0m $1" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)        DOMAIN="$2"; shift 2 ;;
    --namespace)     NAMESPACE="$2"; shift 2 ;;
    --release)       RELEASE="$2"; shift 2 ;;
    --image-tag)        IMAGE_TAG="$2"; shift 2 ;;
    --control-plane-tag) CONTROL_PLANE_TAG="$2"; shift 2 ;;
    --operator-tag)     OPERATOR_TAG="$2"; shift 2 ;;
    --tenant-tag)       TENANT_TAG="$2"; shift 2 ;;
    --storage-class) STORAGE_CLASS="$2"; shift 2 ;;
    --oidc-issuer-url)   OIDC_ISSUER_URL="$2"; shift 2 ;;
    --oidc-client-id)    OIDC_CLIENT_ID="$2"; shift 2 ;;
    --oidc-redirect-uri) OIDC_REDIRECT_URI="$2"; shift 2 ;;
    --platform-operator-seed-email) PLATFORM_OPERATOR_SEED_EMAIL="$2"; shift 2 ;;
    --cert-manager)  CERT_MANAGER="on"; shift ;;
    --acme-email)    ACME_EMAIL="$2"; shift 2 ;;
    --dns01-provider)    DNS01_PROVIDER="$2"; shift 2 ;;
    --dns01-credentials) DNS01_CREDENTIALS="$2"; shift 2 ;;
    --values)        VALUES_FILE="$2"; shift 2 ;;
    --set)           EXTRA_SET+=(--set "$2"); shift 2 ;;
    -h|--help)       grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)               err "Unknown flag: $1"; exit 1 ;;
  esac
done

for c in kubectl helm; do command -v "$c" >/dev/null 2>&1 || { err "Missing required command: $c"; exit 1; }; done
kubectl cluster-info >/dev/null 2>&1 || { err "kubectl can't reach a cluster. Point your context at the target cluster first."; exit 1; }

_gen_secret() { openssl rand -hex 16 2>/dev/null || head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32; }
DB_PASSWORD="${DB_PASSWORD:-$(_gen_secret)}"
LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-sk-$(_gen_secret)}"

log "Target cluster: $(kubectl config current-context)"
log "Namespace: $NAMESPACE   Release: $RELEASE   Image tag: $IMAGE_TAG"

# 1. In-cluster PostgreSQL via the CloudNativePG operator.
log "Installing CloudNativePG operator…"
helm repo add cnpg https://cloudnative-pg.github.io/charts --force-update >/dev/null
helm upgrade --install cnpg cnpg/cloudnative-pg \
  --namespace "$NAMESPACE" --create-namespace --wait \
  --set-string monitoring.podMonitor.enabled=false

log "Creating database credentials…"
kubectl create secret generic "${DB_CLUSTER}-creds" -n "$NAMESPACE" \
  --from-literal=username="$DB_USER" --from-literal=password="$DB_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

log "Provisioning the PostgreSQL cluster…"
kubectl apply -f - <<EOF
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: ${DB_CLUSTER}
  namespace: ${NAMESPACE}
spec:
  instances: 1
  imageName: ghcr.io/cloudnative-pg/postgresql:16
  storage:
    size: 10Gi$( [[ -n "$STORAGE_CLASS" ]] && printf '\n    storageClass: %s' "$STORAGE_CLASS" )
  bootstrap:
    initdb:
      database: ${DB_NAME}
      secret:
        name: ${DB_CLUSTER}-creds
      postInitApplicationSQL:
        - CREATE DATABASE obot OWNER ${DB_USER};
        - CREATE DATABASE litellm OWNER ${DB_USER};
EOF

log "Waiting for the database to become ready…"
kubectl wait --for=condition=Ready "cluster/${DB_CLUSTER}" -n "$NAMESPACE" --timeout="${TIMEOUT}s"

# 2. Connection + LiteLLM secrets the chart expects.
DB_HOST="${DB_CLUSTER}-rw.${NAMESPACE}.svc.cluster.local:5432"

kubectl create secret generic "$DB_SECRET" -n "$NAMESPACE" \
  --from-literal=DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic opencrane-obot -n "$NAMESPACE" \
  --from-literal=dsn="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/obot" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic opencrane-litellm-db -n "$NAMESPACE" \
  --from-literal=DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/litellm" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic opencrane-litellm -n "$NAMESPACE" \
  --from-literal=LITELLM_MASTER_KEY="$LITELLM_MASTER_KEY" --dry-run=client -o yaml | kubectl apply -f -

# 2.5. cert-manager / TLS. MUST run before the chart's `helm install`: the chart
# renders cert-manager.io/v1 Issuer + Certificate objects, so the CRDs (and, for acme,
# a live webhook) have to exist first or the API server rejects the chart with a 400.
# CERT_MANAGER_HELM_FLAGS is appended to the chart's helm args further down.
CERT_MANAGER_HELM_FLAGS=()

# Resolve the effective mode: off (default), selfSigned (--cert-manager only), or
# acme (--cert-manager + --acme-email + --dns01-provider). A partial acme request is a
# hard error here so we never fall back to selfSigned behind the operator's back.
_resolve_cert_mode() {
  if [[ "$CERT_MANAGER" != "on" ]]; then echo "off"; return; fi
  if [[ -z "$ACME_EMAIL" && -z "$DNS01_PROVIDER" ]]; then echo "selfSigned"; return; fi
  if [[ -n "$ACME_EMAIL" && -n "$DNS01_PROVIDER" ]]; then echo "acme"; return; fi
  err "acme TLS needs BOTH --acme-email and --dns01-provider (got only one). For dev/self-signed TLS drop both and pass --cert-manager alone."
  exit 1
}

# Install the cert-manager controller + CRDs (mirrors the CloudNativePG install shape:
# upstream chart, crds.enabled, --wait). Idempotent: helm upgrade --install no-ops when
# cert-manager is already present, so bundling it can never clobber an existing one.
_install_cert_manager() {
  log "Installing cert-manager (CRDs + controller)…"
  helm repo add jetstack https://charts.jetstack.io --force-update >/dev/null
  helm upgrade --install cert-manager jetstack/cert-manager \
    --namespace "$CERT_MANAGER_NAMESPACE" --create-namespace --wait \
    --set crds.enabled=true
}

# DNS-01 preflight (acme only). FAILS FAST with the exact remediation rather than
# letting cert-manager spin on a SOLVING order forever. Two paths:
#   - Workload Identity (no --dns01-credentials): the cert-manager SA's bound GSA needs
#     roles/dns.admin on the zone's project; print the exact gcloud binding command.
#   - External zone (--dns01-credentials FILE): require the file and create the solver
#     Secret in the cert-manager namespace (cert-manager reads ClusterIssuer solver
#     Secrets only from its OWN namespace).
_preflight_dns01() {
  # 1. clouddns is the only provider this installer wires end-to-end; reject others up
  #    front so the failure is a clear message, not a later cert-manager order error.
  if [[ "$DNS01_PROVIDER" != "clouddns" ]]; then
    err "Unsupported --dns01-provider '$DNS01_PROVIDER'. This installer wires 'clouddns' (Google Cloud DNS). For another provider, install cert-manager yourself and set certManager.acme.dns01.{provider,config} in a --values file."
    exit 1
  fi

  if [[ -n "$DNS01_CREDENTIALS" ]]; then
    # 2a. External-zone path: the SA-key file MUST exist; create the solver Secret the
    #     ClusterIssuer references. Failing here is preferable to a green install whose
    #     wildcard cert never issues because the solver has no credentials.
    if [[ ! -f "$DNS01_CREDENTIALS" ]]; then
      err "--dns01-credentials '$DNS01_CREDENTIALS' not found. Provide the Cloud DNS service-account key JSON, or omit it to use GKE Workload Identity."
      exit 1
    fi
    log "Creating Cloud DNS solver Secret in the '$CERT_MANAGER_NAMESPACE' namespace…"
    kubectl create secret generic clouddns-dns01-solver \
      -n "$CERT_MANAGER_NAMESPACE" \
      --from-file=key.json="$DNS01_CREDENTIALS" \
      --dry-run=client -o yaml | kubectl apply -f -
  else
    # 2b. Workload Identity path: we cannot verify the IAM binding from here without the
    #     project/GSA, so we FAIL CLOSED with the precise remediation command. The
    #     operator must confirm roles/dns.admin is bound, then re-run with the binding in
    #     place (or supply --dns01-credentials for an external zone).
    err "DNS-01 via Workload Identity requires roles/dns.admin for the cert-manager service account on the DNS zone's project."
    err "Bind it (replace PROJECT_ID, and GSA with the GCP service account the cert-manager KSA impersonates):"
    err "  gcloud projects add-iam-policy-binding PROJECT_ID \\"
    err "    --member='serviceAccount:GSA@PROJECT_ID.iam.gserviceaccount.com' \\"
    err "    --role='roles/dns.admin'"
    err "Then re-run with the same flags. For an EXTERNAL DNS zone instead, pass --dns01-credentials <sa-key.json>."
    exit 1
  fi
}

CERT_MODE="$(_resolve_cert_mode)"
case "$CERT_MODE" in
  off)
    log "TLS: cert-manager disabled (mode=off). The chart renders no issuer/cert."
    ;;
  selfSigned)
    log "TLS: cert-manager self-signed issuer (dev/k3d/IP — not browser-trusted)."
    _install_cert_manager
    CERT_MANAGER_HELM_FLAGS+=(--set "certManager.enabled=true" --set "certManager.mode=selfSigned")
    ;;
  acme)
    log "TLS: cert-manager ACME / DNS-01 ($DNS01_PROVIDER) — browser-trusted wildcard."
    _install_cert_manager
    # Wait on the webhook BEFORE rendering the chart's issuer/cert: cert-manager's
    # validating webhook rejects cert-manager.io/v1 objects with a 400 until it is live,
    # which would fail the chart install with a confusing connection error.
    log "Waiting for the cert-manager webhook to become ready…"
    kubectl rollout status deploy/cert-manager-webhook -n "$CERT_MANAGER_NAMESPACE" --timeout="${TIMEOUT}s"
    _preflight_dns01
    # cluster-issuer.yaml fail-closes without BOTH acme.email and dns01.provider, so both
    # are always set here. The clouddns solver config is rendered verbatim under
    # solvers[].dns01.clouddns; an external zone references the solver Secret created above.
    CERT_MANAGER_HELM_FLAGS+=(--set "certManager.enabled=true" --set "certManager.mode=acme")
    CERT_MANAGER_HELM_FLAGS+=(--set-string "certManager.acme.email=$ACME_EMAIL")
    CERT_MANAGER_HELM_FLAGS+=(--set "certManager.acme.dns01.provider=$DNS01_PROVIDER")
    if [[ -n "$DNS01_CREDENTIALS" ]]; then
      CERT_MANAGER_HELM_FLAGS+=(--set "certManager.acme.dns01.config.serviceAccountSecretRef.name=clouddns-dns01-solver")
      CERT_MANAGER_HELM_FLAGS+=(--set-string "certManager.acme.dns01.config.serviceAccountSecretRef.key=key.json")
    fi
    ;;
esac

# 3. The OpenCrane chart.
log "Installing the OpenCrane Helm release '$RELEASE'…"
helm_args=(upgrade --install "$RELEASE" "$CHART_DIR" --namespace "$NAMESPACE" --create-namespace
  --set "controlPlane.database.existingSecret=$DB_SECRET"
  --set "litellm.existingDatabaseSecret=opencrane-litellm-db"
  --set "litellm.existingSecret=opencrane-litellm")
# Per-component tags override the unified --image-tag so a single component can be
# rolled through Helm (which keeps Helm the sole owner of the image field). Each
# falls back to IMAGE_TAG when its flag is unset, preserving the all-same default.
CP_TAG="${CONTROL_PLANE_TAG:-$IMAGE_TAG}"
OP_TAG="${OPERATOR_TAG:-$IMAGE_TAG}"
TN_TAG="${TENANT_TAG:-$IMAGE_TAG}"
[[ -n "$CP_TAG" ]] && helm_args+=(--set "controlPlane.image.tag=$CP_TAG")
[[ -n "$OP_TAG" ]] && helm_args+=(--set "operator.image.tag=$OP_TAG")
[[ -n "$TN_TAG" ]] && helm_args+=(--set "tenant.image.tag=$TN_TAG")
[[ -n "$DOMAIN" ]]    && helm_args+=(--set "ingress.domain=$DOMAIN")
# OIDC human-login (control-plane only). Rendered iff an issuer URL is given; otherwise
# the chart emits no OIDC env and the control-plane stays in token/development mode.
[[ -n "$OIDC_ISSUER_URL" ]]   && helm_args+=(--set "controlPlane.oidc.issuerUrl=$OIDC_ISSUER_URL")
[[ -n "$OIDC_CLIENT_ID" ]]    && helm_args+=(--set "controlPlane.oidc.clientId=$OIDC_CLIENT_ID")
[[ -n "$OIDC_REDIRECT_URI" ]] && helm_args+=(--set "controlPlane.oidc.redirectUri=$OIDC_REDIRECT_URI")
# Per-cluster platform-operator SEED. Set ONLY when a non-empty value is supplied; an
# empty seed is never passed, so the chart grants operator to nobody (fail-closed).
if [[ -n "$PLATFORM_OPERATOR_SEED_EMAIL" ]]; then
  helm_args+=(--set-string "controlPlane.oidc.platformOperatorSeedEmail=$PLATFORM_OPERATOR_SEED_EMAIL")
  warn "Seeding platform operator for the cluster (verified OIDC email match). Remove the seed once a group mapping is in place."
fi
[[ -n "$VALUES_FILE" ]] && helm_args+=(--values "$VALUES_FILE")
# cert-manager flags resolved in Step 2.5 (empty in mode=off). Placed before --set
# overrides so an operator can still override individual issuer fields on the CLI.
helm_args+=("${CERT_MANAGER_HELM_FLAGS[@]}")
helm_args+=("${EXTRA_SET[@]}")
helm "${helm_args[@]}"

# 4. Wait for the core workloads.
# Database migrations run automatically in the control-plane's `db-migrate`
# initContainer (prisma migrate deploy) before the server starts — so the
# rollout below also gates on a successful migration. Any `helm upgrade` or
# pod restart re-runs it idempotently; no separate migration Job needed.
kubectl rollout status "deployment/${RELEASE}-operator" -n "$NAMESPACE" --timeout="${TIMEOUT}s"
kubectl rollout status "deployment/${RELEASE}-control-plane" -n "$NAMESPACE" --timeout="${TIMEOUT}s"

log "Done. OpenCrane is installed in namespace '$NAMESPACE'."
[[ -n "$DOMAIN" ]] && log "Point your DNS at the ingress, then visit https://${DOMAIN}"
log "Ingress: kubectl get ingress -n $NAMESPACE"
