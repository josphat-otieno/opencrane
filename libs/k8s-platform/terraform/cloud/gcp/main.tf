# -----------------------------------------------------------------------------
# OpenCrane GCP Infrastructure
#
# Provisions networking, GKE, Artifact Registry, the Cloud DNS zone + shared
# DNS-writer Workload-Identity binding, and then applies the cloud-agnostic core
# module onto the resulting cluster. Per-org DNS records are reconciled at runtime
# by external-dns from the operator's DNSEndpoint CRs, not by Terraform.
#
# Bucket provisioning is handled in-operator via GcpHostingAdapter +
# @google-cloud/storage + Workload Identity.
#
# Usage:
#   cd platform/terraform/cloud/gcp
#   terraform init
#   terraform apply -var-file=../../environments/dev/terraform.tfvars
# -----------------------------------------------------------------------------

data "google_client_config" "default" {}

# ---- Phase 1: Networking ----

module "networking"
{
  source = "../../modules/networking"

  project_id = var.project_id
  region     = var.region
  vpc_name   = var.vpc_name
}

# ---- Phase 2: GKE Cluster ----

module "gke"
{
  source = "../../modules/gke"

  project_id   = var.project_id
  region       = var.region
  cluster_name = var.cluster_name
  vpc_id       = module.networking.vpc_id
  subnet_id    = module.networking.subnet_id

  depends_on = [module.networking]
}

# Configure kubernetes and helm providers using GKE cluster credentials

provider "kubernetes"
{
  host                   = "https://${module.gke.cluster_endpoint}"
  cluster_ca_certificate = base64decode(module.gke.cluster_ca_certificate)
  token                  = data.google_client_config.default.access_token
}

provider "helm"
{
  kubernetes
  {
    host                   = "https://${module.gke.cluster_endpoint}"
    cluster_ca_certificate = base64decode(module.gke.cluster_ca_certificate)
    token                  = data.google_client_config.default.access_token
  }
}

# ---- Phase 3: Artifact Registry ----

module "artifact_registry"
{
  source = "../../modules/artifact-registry"

  project_id    = var.project_id
  region        = var.region
  repository_id = "opencrane"
}

# ---- Phase 4: Application (OpenCrane core + DB migration) ----

module "app_deploy"
{
  source = "../../modules/app-deploy"

  project_id       = var.project_id
  registry_url     = module.artifact_registry.repository_url
  image_tag        = var.image_tag
  domain           = var.domain
  namespace        = "opencrane"
  fleet_chart_path = var.fleet_chart_path

  depends_on = [module.gke]
}

# ---- Phase 5: Cloud DNS (zone + platform records + shared DNS-writer WI) ----
#
# Provisions the managed zone, the install-time platform records (apex, `*.<base>`,
# opencrane-ui host) and the shared `roles/dns.admin` Workload-Identity binding that
# external-dns and the cert-manager DNS-01 solver impersonate. Per-org/per-host records
# are reconciled at runtime by external-dns from the operator's DNSEndpoint CRs — never
# written here.

module "dns"
{
  source = "../../modules/dns"

  project_id = var.project_id
  domain     = var.domain
  ingress_ip = module.app_deploy.ingress_ip

  depends_on = [module.app_deploy]
}
