# -----------------------------------------------------------------------------
# OpenCrane GCP Infrastructure
#
# DEFAULT FLOW (plain-k8s on GKE): ensure a GKE cluster on the project's default
# VPC, deploy in-cluster PostgreSQL + the OpenCrane Helm chart, and print the
# ingress IP for manual DNS. Custom VPC/NAT, Artifact Registry, Cloud DNS, and
# GCS-backed tenant storage are all OPT-IN (see variables.tf).
#
# Usage:
#   cd platform/terraform
#   terraform init
#   terraform apply -var-file=environments/dev/terraform.tfvars
# -----------------------------------------------------------------------------

data "google_client_config" "default" {}

# ---- Phase 1: Networking (OPT-IN) ----
#
# When enable_custom_vpc=false (default) GKE runs on the project default VPC and
# no networking resources are created.

module "networking"
{
  source = "./modules/networking"
  count  = var.enable_custom_vpc ? 1 : 0

  project_id = var.project_id
  region     = var.region
  vpc_name   = var.vpc_name
}

# ---- Phase 2: GKE Cluster ----

module "gke"
{
  source = "./modules/gke"

  project_id   = var.project_id
  region       = var.region
  cluster_name = var.cluster_name

  # Empty strings → the GKE module falls back to the project default VPC.
  vpc_id    = var.enable_custom_vpc ? module.networking[0].vpc_id : ""
  subnet_id = var.enable_custom_vpc ? module.networking[0].subnet_id : ""

  # Private nodes + Cloud NAT only make sense with a custom VPC.
  enable_private_nodes = var.enable_custom_vpc

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

# ---- Phase 3: Artifact Registry (OPT-IN) ----
#
# Default flow pushes images to an external registry (e.g. ghcr.io). Enable to
# provision a GCP Artifact Registry instead.

module "artifact_registry"
{
  source = "./modules/artifact-registry"
  count  = var.enable_artifact_registry ? 1 : 0

  project_id    = var.project_id
  region        = var.region
  repository_id = "opencrane"
}

locals
{
  registry_url = var.enable_artifact_registry ? module.artifact_registry[0].repository_url : var.registry_url
}

# ---- Phase 4: Application (PostgreSQL + OpenCrane + DB migration) ----

module "app_deploy"
{
  source = "./modules/app-deploy"

  project_id         = var.project_id
  registry_url       = local.registry_url
  image_tag          = var.image_tag
  domain             = var.domain
  namespace          = "opencrane"
  enable_gcs_storage = var.enable_gcs_storage

  depends_on = [module.gke]
}

# ---- Phase 5: Cloud DNS (OPT-IN: wildcard → ingress IP) ----
#
# Default flow prints the ingress IP and you point DNS at it manually. Enable to
# have Terraform manage a Cloud DNS zone + records.

module "dns"
{
  source = "./modules/dns"
  count  = var.enable_cloud_dns ? 1 : 0

  project_id = var.project_id
  domain     = var.domain
  ingress_ip = module.app_deploy.ingress_ip

  depends_on = [module.app_deploy]
}
